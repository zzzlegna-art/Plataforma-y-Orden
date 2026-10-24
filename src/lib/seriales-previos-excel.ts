import * as XLSX from "xlsx-js-style";

export const MAX_SERIAL_IMPORT = 20_000;
export const MAX_SERIAL_IMPORT_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_SERIAL_IMPORT_FILES = 100;
export const MAX_SERIAL_IMPORT_TOTAL = 100_000;

export type SerialWorkbookErrorCode =
  | "empty"
  | "too_many"
  | "unsafe_number"
  | "invalid_file";

export class SerialWorkbookError extends Error {
  constructor(
    readonly code: SerialWorkbookErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "SerialWorkbookError";
  }
}

export type RegistroSerialPrevioExcel = {
  serial: string;
  referencia?: string;
  cliente?: string;
  fechaVenta?: string;
  notas?: string;
};

export type ParsedSerialWorkbook = {
  seriales: string[];
  registros: RegistroSerialPrevioExcel[];
  hojas: string[];
  columnas: string[];
  clienteDetectado?: string;
  fechaVentaDetectada?: string;
  advertencia?: "fallback_first_column" | "ignored_sheets" | "legacy_matrix";
};

type CellLike = { v?: unknown; w?: string; t?: string; z?: string };

const normalizarCabecera = (valor: unknown) =>
  String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const esCabeceraSerial = (valor: unknown) => {
  const texto = normalizarCabecera(valor);
  return /(^| )(serial(?:es|s)?(?: (?:no|number|numero|\d+))?|imei\s*\d*|sn|s n|numero de serie|nro de serie|no de serie)( |$)/.test(texto);
};

const esCabeceraReferencia = (valor: unknown) =>
  /^(referencia|referencias|modelo|producto|nombre producto|product|model|item)$/.test(
    normalizarCabecera(valor),
  );

const esCabeceraCliente = (valor: unknown) =>
  /^(cliente|client|customer|comprador|vendido a|nombre cliente|a nombre de|sold to|buyer|destinatario)$/.test(
    normalizarCabecera(valor),
  );

const esCabeceraFecha = (valor: unknown) =>
  /^(fecha|fecha venta|fecha de venta|date|sale date|fecha comercial)$/.test(
    normalizarCabecera(valor),
  );

const esCabeceraConocida = (valor: unknown) =>
  esCabeceraSerial(valor) ||
  esCabeceraReferencia(valor) ||
  esCabeceraCliente(valor) ||
  esCabeceraFecha(valor) ||
  /^(cantidad|qty|quantity|total|observacion|observaciones|notas|notes|sku|marca|brand)$/.test(
    normalizarCabecera(valor),
  );

const validarFecha = (year: number, month: number, day: number): string | undefined => {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const parsearTextoFecha = (valor: unknown): string | undefined => {
  const texto = String(valor ?? "").trim();
  if (!texto) return undefined;

  const iso = texto.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return validarFecha(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const local = texto.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (local) return validarFecha(Number(local[3]), Number(local[2]), Number(local[1]));

  return undefined;
};

const parsearFechaCelda = (celda: CellLike | undefined): string | undefined => {
  if (!celda || celda.t === "e") return undefined;

  const fechaTexto = parsearTextoFecha(celda.w) ?? parsearTextoFecha(celda.v);
  if (fechaTexto) return fechaTexto;
  if (celda.v instanceof Date) {
    return validarFecha(celda.v.getUTCFullYear(), celda.v.getUTCMonth() + 1, celda.v.getUTCDate());
  }

  if (
    typeof celda.v === "number" &&
    typeof celda.z === "string" &&
    /[dmy]/i.test(celda.z)
  ) {
    // Excel almacena fechas como días desde 1899-12-30 en el sistema 1900.
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(celda.v) * 86_400_000);
    return validarFecha(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  return undefined;
};

const valorCelda = (
  hoja: XLSX.WorkSheet,
  fila: number,
  columna: number,
  nombreHoja: string,
): string => {
  const direccion = XLSX.utils.encode_cell({ r: fila, c: columna });
  const celda = hoja[direccion] as CellLike | undefined;
  if (!celda || celda.v === null || celda.v === undefined || celda.t === "e") return "";

  if (typeof celda.v === "string") return celda.v.trim();

  if (typeof celda.v === "number") {
    if (!Number.isSafeInteger(celda.v) || celda.v < 0) {
      throw new SerialWorkbookError(
        "unsafe_number",
        "Una celda numérica puede haber perdido precisión.",
        `${nombreHoja}!${direccion}`,
      );
    }
    const mostrado = typeof celda.w === "string" ? celda.w.trim() : "";
    // Respeta formatos de Excel como 000000000000123, que conservan ceros iniciales.
    if (mostrado && /^\d+$/.test(mostrado) && Number(mostrado) === celda.v) {
      if (mostrado.replace(/^0+/, "").length > 15) {
        throw new SerialWorkbookError(
          "unsafe_number",
          "Excel solo conserva 15 dígitos significativos en celdas numéricas.",
          `${nombreHoja}!${direccion}`,
        );
      }
      return mostrado;
    }
    const numerico = String(celda.v);
    if (numerico.replace(/^0+/, "").length > 15) {
      throw new SerialWorkbookError(
        "unsafe_number",
        "Excel solo conserva 15 dígitos significativos en celdas numéricas.",
        `${nombreHoja}!${direccion}`,
      );
    }
    return numerico;
  }

  if (typeof celda.v === "bigint") return celda.v.toString();
  return "";
};

const celda = (hoja: XLSX.WorkSheet, fila: number, columna: number) =>
  hoja[XLSX.utils.encode_cell({ r: fila, c: columna })] as CellLike | undefined;

const esSerialProbable = (valor: string) =>
  valor.length >= 5 &&
  valor.length <= 32 &&
  !/\s/.test(valor) &&
  /\d/.test(valor) &&
  /^[a-z0-9._/-]+$/i.test(valor);

type HojaDetectada = {
  nombre: string;
  hoja: XLSX.WorkSheet;
  filaEncabezado: number;
  inicioDatos: number;
  columnasSerial: number[];
  encabezadosSerial: string[];
  columnasTodas: string[];
  columnasReferencia: number[];
  columnaCliente?: number;
  columnaFecha?: number;
  filaFin: number;
  tipo: "encabezado" | "matriz" | "primera_columna";
  clienteMatriz?: string;
};

const detectarHojaConEncabezado = (
  libro: XLSX.WorkBook,
  nombre: string,
): HojaDetectada | null => {
  const hoja = libro.Sheets[nombre];
  const referencia = hoja?.["!ref"];
  if (!hoja || !referencia) return null;

  const rango = XLSX.utils.decode_range(referencia);
  const ultimaFilaBusqueda = Math.min(rango.e.r, rango.s.r + 14);

  for (let fila = rango.s.r; fila <= ultimaFilaBusqueda; fila += 1) {
    const columnasSerial: number[] = [];
    const encabezadosSerial: string[] = [];
    const columnasTodas: string[] = [];
    const columnasReferencia: number[] = [];
    let columnaCliente: number | undefined;
    let columnaFecha: number | undefined;

    for (let columna = rango.s.c; columna <= rango.e.c; columna += 1) {
      const valor = (celda(hoja, fila, columna)?.v ?? "") as unknown;
      const texto = String(valor ?? "").trim();
      columnasTodas[columna] = texto;
      if (esCabeceraSerial(valor)) {
        columnasSerial.push(columna);
        encabezadosSerial.push(texto || XLSX.utils.encode_col(columna));
      }
      if (esCabeceraReferencia(valor)) columnasReferencia.push(columna);
      if (esCabeceraCliente(valor)) columnaCliente = columna;
      if (esCabeceraFecha(valor)) columnaFecha = columna;
    }

    if (columnasSerial.length > 0) {
      return {
        nombre,
        hoja,
        filaEncabezado: fila,
        inicioDatos: fila + 1,
        columnasSerial,
        encabezadosSerial,
        columnasTodas,
        columnasReferencia,
        columnaCliente,
        columnaFecha,
        filaFin: rango.e.r,
        tipo: "encabezado",
      };
    }
  }
  return null;
};

const detectarMatrizPorReferencia = (
  libro: XLSX.WorkBook,
  nombre: string,
): HojaDetectada | null => {
  const hoja = libro.Sheets[nombre];
  const referencia = hoja?.["!ref"];
  if (!hoja || !referencia) return null;

  const rango = XLSX.utils.decode_range(referencia);
  const ultimaFilaBusqueda = Math.min(rango.e.r, rango.s.r + 14);
  const ultimaColumnaBusqueda = Math.min(rango.e.c, rango.s.c + 79);
  let mejor: HojaDetectada | null = null;
  let maxColumnas = 0;

  for (let fila = rango.s.r; fila <= ultimaFilaBusqueda; fila += 1) {
    const columnasSerial: number[] = [];
    const encabezadosSerial: string[] = [];
    const columnasTodas: string[] = [];

    for (let columna = rango.s.c; columna <= ultimaColumnaBusqueda; columna += 1) {
      const encabezado = valorCelda(hoja, fila, columna, nombre);
      columnasTodas[columna] = encabezado;
      if (!encabezado || esCabeceraConocida(encabezado) || esSerialProbable(encabezado)) continue;

      let cantidadSeriales = 0;
      for (let filaDato = fila + 1; filaDato <= rango.e.r; filaDato += 1) {
        const valor = valorCelda(hoja, filaDato, columna, nombre);
        if (esSerialProbable(valor)) cantidadSeriales += 1;
      }
      if (cantidadSeriales > 0) {
        columnasSerial.push(columna);
        encabezadosSerial.push(encabezado);
      }
    }

    if (columnasSerial.length > maxColumnas) {
      maxColumnas = columnasSerial.length;
      let clienteMatriz: string | undefined;
      const primeraColumna = rango.s.c;
      const segundaColumna = primeraColumna + 1;
      const encabezadoIzquierdo = columnasTodas[primeraColumna] ?? "";
      const encabezadoCliente = columnasTodas[segundaColumna] ?? "";
      if (
        esCabeceraReferencia(encabezadoIzquierdo) &&
        encabezadoCliente &&
        !esCabeceraConocida(encabezadoCliente) &&
        !esSerialProbable(encabezadoCliente)
      ) {
        let hayReferenciaYCantidad = false;
        for (let filaDato = fila + 1; filaDato <= Math.min(rango.e.r, fila + 20); filaDato += 1) {
          const ref = valorCelda(hoja, filaDato, primeraColumna, nombre);
          const cantidad = valorCelda(hoja, filaDato, segundaColumna, nombre);
          if (ref && !esSerialProbable(ref) && cantidad && /^\d+(?:[.,]\d+)?$/.test(cantidad)) {
            hayReferenciaYCantidad = true;
            break;
          }
        }
        if (hayReferenciaYCantidad) clienteMatriz = encabezadoCliente;
      }

      mejor = {
        nombre,
        hoja,
        filaEncabezado: fila,
        inicioDatos: fila + 1,
        columnasSerial,
        encabezadosSerial,
        columnasTodas,
        columnasReferencia: [],
        filaFin: rango.e.r,
        tipo: "matriz",
        clienteMatriz,
      };
    }
  }

  return mejor;
};

const detectarPrimeraColumna = (
  libro: XLSX.WorkBook,
  nombre: string,
): HojaDetectada | null => {
  const hoja = libro.Sheets[nombre];
  const referencia = hoja?.["!ref"];
  if (!hoja || !referencia) return null;

  const rango = XLSX.utils.decode_range(referencia);
  for (let columna = rango.s.c; columna <= rango.e.c; columna += 1) {
    for (let fila = rango.s.r; fila <= rango.e.r; fila += 1) {
      if (valorCelda(hoja, fila, columna, nombre)) {
        return {
          nombre,
          hoja,
          filaEncabezado: rango.s.r,
          inicioDatos: rango.s.r,
          columnasSerial: [columna],
          encabezadosSerial: [XLSX.utils.encode_col(columna)],
          columnasTodas: [],
          columnasReferencia: [],
          filaFin: rango.e.r,
          tipo: "primera_columna",
        };
      }
    }
  }
  return null;
};

const detectarFechaEnNombre = (nombre?: string): string | undefined => {
  if (!nombre) return undefined;
  const iso = nombre.match(/(?:^|\D)(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})(?:\D|$)/);
  if (iso) return validarFecha(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const local = nombre.match(/(?:^|\D)(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})(?:\D|$)/);
  if (local) return validarFecha(Number(local[3]), Number(local[2]), Number(local[1]));
  return undefined;
};

const detectarFechaSinEtiqueta = (libro: XLSX.WorkBook): string | undefined => {
  const fechas = new Set<string>();
  for (const nombreHoja of libro.SheetNames) {
    const hoja = libro.Sheets[nombreHoja];
    const referencia = hoja?.["!ref"];
    if (!hoja || !referencia) continue;
    const rango = XLSX.utils.decode_range(referencia);
    const maxFila = Math.min(rango.e.r, rango.s.r + 4);
    const maxColumna = Math.min(rango.e.c, rango.s.c + 30);

    for (let fila = rango.s.r; fila <= maxFila; fila += 1) {
      let filaDeDatosSeriales = false;
      for (let columna = rango.s.c; columna <= maxColumna; columna += 1) {
        const valor = valorCelda(hoja, fila, columna, nombreHoja);
        if (esCabeceraSerial(valor) || esSerialProbable(valor)) {
          filaDeDatosSeriales = true;
          break;
        }
      }
      if (filaDeDatosSeriales) continue;

      for (let columna = rango.s.c; columna <= maxColumna; columna += 1) {
        const fecha = parsearFechaCelda(celda(hoja, fila, columna)) ??
          parsearTextoFecha(valorCelda(hoja, fila, columna, nombreHoja));
        if (fecha) fechas.add(fecha);
      }
    }
  }
  return fechas.size === 1 ? [...fechas][0] : undefined;
};

const detectarMetadatosEnLibro = (
  libro: XLSX.WorkBook,
  nombreArchivo?: string,
): { cliente?: string; fechaVenta?: string } => {
  let cliente: string | undefined;
  let fechaVenta: string | undefined;

  for (const nombreHoja of libro.SheetNames) {
    const hoja = libro.Sheets[nombreHoja];
    const referencia = hoja?.["!ref"];
    if (!hoja || !referencia) continue;
    const rango = XLSX.utils.decode_range(referencia);
    const maxFila = Math.min(rango.e.r, rango.s.r + 14);
    const maxColumna = Math.min(rango.e.c, rango.s.c + 30);

    for (let fila = rango.s.r; fila <= maxFila; fila += 1) {
      let tieneCabeceraSerial = false;
      for (let columna = rango.s.c; columna <= maxColumna; columna += 1) {
        if (esCabeceraSerial(celda(hoja, fila, columna)?.v)) {
          tieneCabeceraSerial = true;
          break;
        }
      }
      if (tieneCabeceraSerial) continue;

      for (let columna = rango.s.c; columna <= maxColumna; columna += 1) {
        const valor = valorCelda(hoja, fila, columna, nombreHoja);
        if (!fechaVenta && esCabeceraFecha(valor)) {
          fechaVenta =
            parsearFechaCelda(celda(hoja, fila, columna + 1)) ??
            parsearFechaCelda(celda(hoja, fila + 1, columna));
        } else if (!fechaVenta && /^(fecha de venta|fecha|date)\s*[:=-]\s*(.+)$/.test(valor.toLowerCase())) {
          const match = valor.match(/[:=-]\s*(.+)$/);
          fechaVenta = match ? parsearTextoFecha(match[1]) : undefined;
        }

        if (!cliente && esCabeceraCliente(valor)) {
          const siguiente = valorCelda(hoja, fila, columna + 1, nombreHoja);
          const debajo = valorCelda(hoja, fila + 1, columna, nombreHoja);
          const candidato = siguiente && !esCabeceraConocida(siguiente) ? siguiente : debajo;
          if (candidato && !esCabeceraConocida(candidato) && !esSerialProbable(candidato)) {
            cliente = candidato;
          }
        }
      }
    }
  }

  return {
    cliente,
    fechaVenta: fechaVenta ?? detectarFechaSinEtiqueta(libro) ?? detectarFechaEnNombre(nombreArchivo),
  };
};

const detectarColumna = (hoja: HojaDetectada, predicado: (valor: unknown) => boolean) => {
  for (let columna = 0; columna < hoja.columnasTodas.length; columna += 1) {
    if (predicado(hoja.columnasTodas[columna])) return columna;
  }
  return undefined;
};

/**
 * Lee seriales/IMEI en formatos tabulares y matrices por referencia.
 * Si no encuentra una estructura reconocible, conserva el modo antiguo de
 * primera columna y lo advierte para que el usuario revise la vista previa.
 */
export const parseSerialWorkbook = (
  datos: ArrayBuffer,
  nombreArchivo?: string,
): ParsedSerialWorkbook => {
  let libro: XLSX.WorkBook;
  try {
    libro = XLSX.read(datos, { type: "array", cellDates: true, dense: false });
  } catch {
    throw new SerialWorkbookError("invalid_file", "No se pudo leer el archivo.");
  }

  if (!libro.SheetNames.length) {
    throw new SerialWorkbookError("empty", "El archivo no contiene hojas.");
  }

  const hojasDetectadas: HojaDetectada[] = [];
  for (const nombre of libro.SheetNames) {
    const encabezado = detectarHojaConEncabezado(libro, nombre);
    if (encabezado) {
      hojasDetectadas.push(encabezado);
      continue;
    }
    const matriz = detectarMatrizPorReferencia(libro, nombre);
    if (matriz) hojasDetectadas.push(matriz);
  }

  const metadatos = detectarMetadatosEnLibro(libro, nombreArchivo);
  const hojasUsadas = hojasDetectadas.length > 0
    ? hojasDetectadas
    : [detectarPrimeraColumna(libro, libro.SheetNames[0])].filter(
        (hoja): hoja is HojaDetectada => hoja !== null,
      );

  const registros: RegistroSerialPrevioExcel[] = [];
  const columnas: string[] = [];

  for (const detectada of hojasUsadas) {
    detectada.columnasSerial.forEach((columna, indice) => {
      columnas.push(
        `${detectada.nombre}: ${detectada.encabezadosSerial[indice] || XLSX.utils.encode_col(columna)}`,
      );
    });

    const columnaReferencia = detectada.tipo === "encabezado"
      ? detectarColumna(detectada, esCabeceraReferencia)
      : undefined;
    const columnaCliente = detectada.tipo === "encabezado"
      ? detectarColumna(detectada, esCabeceraCliente)
      : undefined;
    const columnaFecha = detectada.tipo === "encabezado"
      ? detectarColumna(detectada, esCabeceraFecha)
      : undefined;

    for (let fila = detectada.inicioDatos; fila <= detectada.filaFin; fila += 1) {
      for (let indice = 0; indice < detectada.columnasSerial.length; indice += 1) {
        const columna = detectada.columnasSerial[indice];
        const serial = valorCelda(detectada.hoja, fila, columna, detectada.nombre);
        if (!serial) continue;
        if (detectada.tipo === "matriz" && !esSerialProbable(serial)) continue;

        const referencia = detectada.tipo === "matriz"
          ? detectada.encabezadosSerial[indice]
          : columnaReferencia !== undefined
            ? valorCelda(detectada.hoja, fila, columnaReferencia, detectada.nombre)
            : undefined;
        const cliente = columnaCliente !== undefined
          ? valorCelda(detectada.hoja, fila, columnaCliente, detectada.nombre)
          : detectada.clienteMatriz ?? metadatos.cliente;
        const fechaVenta = columnaFecha !== undefined
          ? parsearFechaCelda(celda(detectada.hoja, fila, columnaFecha))
          : metadatos.fechaVenta;

        registros.push({
          serial,
          referencia: referencia?.trim() || undefined,
          cliente: cliente?.trim() || undefined,
          fechaVenta,
        });
        if (registros.length > MAX_SERIAL_IMPORT) {
          throw new SerialWorkbookError(
            "too_many",
            `El archivo supera el límite de ${MAX_SERIAL_IMPORT.toLocaleString("es-CO")} seriales.`,
          );
        }
      }
    }
  }

  if (registros.length === 0) {
    throw new SerialWorkbookError("empty", "No se encontraron seriales en las columnas detectadas.");
  }

  const advertencia =
    hojasDetectadas.length === 0
      ? "fallback_first_column"
      : hojasDetectadas.some((hoja) => hoja.tipo === "matriz")
        ? "legacy_matrix"
        : hojasDetectadas.length < libro.SheetNames.length
          ? "ignored_sheets"
          : undefined;

  const clientes = [...new Set(registros.map((registro) => registro.cliente).filter(Boolean))];
  const hayColumnaClientePorFila = hojasUsadas.some(
    (hoja) => hoja.tipo === "encabezado" && detectarColumna(hoja, esCabeceraCliente) !== undefined,
  );

  return {
    seriales: registros.map((registro) => registro.serial),
    registros,
    hojas: hojasUsadas.map((hoja) => hoja.nombre),
    columnas,
    clienteDetectado: !hayColumnaClientePorFila && clientes.length === 1 ? clientes[0] : metadatos.cliente,
    // Una fecha en una columna por fila no se debe convertir en fecha general del archivo.
    fechaVentaDetectada: metadatos.fechaVenta,
    advertencia,
  };
};
