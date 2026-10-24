import * as XLSX from "xlsx-js-style";

export const MAX_SERIAL_IMPORT = 20_000;
export const MAX_SERIAL_IMPORT_FILE_BYTES = 25 * 1024 * 1024;

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

export type ParsedSerialRecord = {
  serial: string;
  referencia?: string;
  cliente?: string;
  fechaVenta?: string;
  hoja: string;
  fila: number;
};

export type ParsedSerialWorkbook = {
  seriales: string[];
  registros: ParsedSerialRecord[];
  hojas: string[];
  columnas: string[];
  clienteDetectado?: string;
  fechaVentaDetectada?: string;
  advertencia?: "fallback_first_column" | "ignored_sheets";
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
  /(^| )(referencia|referencias|modelo|producto|articulo|product|model|sku|item)( |$)/.test(
    normalizarCabecera(valor),
  );

const esCabeceraCliente = (valor: unknown) =>
  /(^| )(cliente|clientes|comprador|compradora|customer|client|cliente final|nombre cliente|vendido a|venta a)( |$)/.test(
    normalizarCabecera(valor),
  );

const esCabeceraFecha = (valor: unknown) =>
  /(^| )(fecha|fecha venta|fecha de venta|fecha venta previa|date|dia|fecha factura|fecha pedido)( |$)/.test(
    normalizarCabecera(valor),
  );

const esCabeceraConocida = (valor: unknown) =>
  esCabeceraSerial(valor) ||
  esCabeceraReferencia(valor) ||
  esCabeceraCliente(valor) ||
  esCabeceraFecha(valor) ||
  /(^| )(cantidad(?:es)?|qty|quantities|total(?:es)?|precio(?:s)?|valor(?:es)?|vendedor(?:es)?|observaciones|notas)( |$)/.test(normalizarCabecera(valor));

/**
 * En los Excel agrupados por vendedor/cliente y modelo, el encabezado puede verse
 * como «1. Chavela : Apple iPhone 12 - 128». Separa ambas partes para no guardar
 * el encabezado completo como referencia ni confundirlo con un cliente global.
 */
const descomponerEncabezadoVenta = (
  valor: string,
): { cliente?: string; referencia?: string } => {
  const coincidencia = valor.trim().match(/^\\s*\\d+\\s*[.)]\\s*(.+?)\\s*:\\s*(.+?)\\s*$/);
  if (!coincidencia) return {};

  const cliente = coincidencia[1].trim();
  const referencia = coincidencia[2].trim();
  if (!cliente || !referencia || esCabeceraConocida(cliente) || esCabeceraConocida(referencia)) {
    return {};
  }

  return { cliente, referencia };
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

const textoCelda = (hoja: XLSX.WorkSheet, fila: number, columna: number): string => {
  const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: columna })] as CellLike | undefined;
  if (!celda || celda.v === null || celda.v === undefined || celda.t === "e") return "";
  if (typeof celda.v === "string") return celda.v.trim();
  return typeof celda.w === "string" ? celda.w.trim() : String(celda.v);
};

const fechaIso = (year: number, month: number, day: number): string | undefined => {
  if (year < 1990 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return undefined;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
};

/** Excel y los archivos de ventas suelen usar fecha colombiana: DD-MM-AAAA. */
const normalizarFecha = (valor: unknown): string | undefined => {
  const texto = String(valor ?? "").trim();
  if (!texto) return undefined;

  const iso = texto.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s.*)?$/);
  if (iso) return fechaIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const local = texto.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s.*)?$/);
  if (local) return fechaIso(Number(local[3]), Number(local[2]), Number(local[1]));

  return undefined;
};

const fechaDesdeCelda = (
  hoja: XLSX.WorkSheet,
  fila: number,
  columna: number,
): string | undefined => {
  const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: columna })] as CellLike | undefined;
  if (!celda || celda.v === null || celda.v === undefined || celda.t === "e") return undefined;

  if (typeof celda.v === "number") {
    const fecha = XLSX.SSF.parse_date_code(celda.v);
    if (fecha) return fechaIso(fecha.y, fecha.m, fecha.d);
  }
  return normalizarFecha(typeof celda.w === "string" ? celda.w : celda.v);
};

const fechaDesdeNombre = (nombre: string): string | undefined => {
  const nombreLimpio = nombre.replace(/\.[^.]+$/, "");
  const iso = nombreLimpio.match(/(?:^|\D)(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?:\D|$)/);
  if (iso) {
    const fecha = fechaIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (fecha) return fecha;
  }
  const local = nombreLimpio.match(/(?:^|\D)(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})(?:\D|$)/);
  if (local) return fechaIso(Number(local[3]), Number(local[2]), Number(local[1]));
  return undefined;
};

const pareceSerial = (valor: string) => {
  const limpio = valor.trim();
  if (/\s/.test(limpio)) return false;
  return /^\d{10,20}$/.test(limpio) ||
    (/^[A-Z0-9][A-Z0-9-]{7,24}$/i.test(limpio) && /[A-Z]/i.test(limpio) && /\d/.test(limpio));
};

type HojaDetectada = {
  nombre: string;
  hoja: XLSX.WorkSheet;
  filaCabecera: number;
  inicioDatos: number;
  finDatos: number;
  columnasSerial: number[];
  encabezados: string[];
  columnaReferencia?: number;
  columnaCliente?: number;
  columnaFecha?: number;
  porDatos?: boolean;
};

const detectarHojaConEncabezado = (
  libro: XLSX.WorkBook,
  nombre: string,
): HojaDetectada | null => {
  const hoja = libro.Sheets[nombre];
  const referencia = hoja?.["!ref"];
  if (!hoja || !referencia) return null;

  const rango = XLSX.utils.decode_range(referencia);
  const ultimaFilaBusqueda = Math.min(rango.e.r, rango.s.r + 19);

  for (let fila = rango.s.r; fila <= ultimaFilaBusqueda; fila += 1) {
    const columnasSerial: number[] = [];
    const encabezados: string[] = [];
    let columnaReferencia: number | undefined;
    let columnaCliente: number | undefined;
    let columnaFecha: number | undefined;

    for (let columna = rango.s.c; columna <= rango.e.c; columna += 1) {
      const direccion = XLSX.utils.encode_cell({ r: fila, c: columna });
      const valor = (hoja[direccion] as CellLike | undefined)?.v;
      const texto = String(valor ?? "").trim();

      if (esCabeceraSerial(valor)) {
        columnasSerial.push(columna);
        encabezados.push(texto || XLSX.utils.encode_col(columna));
      }
      if (columnaReferencia === undefined && esCabeceraReferencia(valor)) columnaReferencia = columna;
      if (columnaCliente === undefined && esCabeceraCliente(valor)) columnaCliente = columna;
      if (columnaFecha === undefined && esCabeceraFecha(valor)) columnaFecha = columna;
    }

    if (columnasSerial.length > 0) {
      return {
        nombre,
        hoja,
        filaCabecera: fila,
        inicioDatos: fila + 1,
        finDatos: rango.e.r,
        columnasSerial,
        encabezados,
        columnaReferencia,
        columnaCliente,
        columnaFecha,
      };
    }
  }
  return null;
};

const detectarColumnasPorDatos = (
  libro: XLSX.WorkBook,
  nombre: string,
): HojaDetectada | null => {
  const hoja = libro.Sheets[nombre];
  const referencia = hoja?.["!ref"];
  if (!hoja || !referencia) return null;

  const rango = XLSX.utils.decode_range(referencia);
  const columnasSerial: number[] = [];
  const primerasFilasSerial = new Map<number, number>();

  for (let columna = rango.s.c; columna <= rango.e.c; columna += 1) {
    for (let fila = rango.s.r; fila <= rango.e.r; fila += 1) {
      const raw = (hoja[XLSX.utils.encode_cell({ r: fila, c: columna })] as CellLike | undefined)?.v;
      if (raw === null || raw === undefined) continue;
      const candidato = typeof raw === "string" ? raw.trim() : String(raw);
      if (pareceSerial(candidato)) {
        // Usa el mismo validador de precisión que las columnas con encabezado explícito.
        valorCelda(hoja, fila, columna, nombre);
        columnasSerial.push(columna);
        primerasFilasSerial.set(columna, fila);
        break;
      }
    }
  }

  if (columnasSerial.length === 0) return null;

  const encabezados = columnasSerial.map((columna) => {
    const filaDatos = primerasFilasSerial.get(columna) ?? rango.s.r;
    for (let fila = filaDatos - 1; fila >= Math.max(rango.s.r, filaDatos - 5); fila -= 1) {
      const texto = textoCelda(hoja, fila, columna);
      if (texto && !esCabeceraConocida(texto) && !/^\d+$/.test(texto)) return texto;
    }
    return XLSX.utils.encode_col(columna);
  });

  // Si existe una fila de encabezados de metadatos en la parte superior, reutiliza sus columnas.
  let filaCabecera = Math.max(rango.s.r, Math.min(...[...primerasFilasSerial.values()]) - 1);
  let columnaReferencia: number | undefined;
  let columnaCliente: number | undefined;
  let columnaFecha: number | undefined;
  for (let fila = rango.s.r; fila <= Math.min(rango.e.r, rango.s.r + 19); fila += 1) {
    for (let columna = rango.s.c; columna <= rango.e.c; columna += 1) {
      const valor = (hoja[XLSX.utils.encode_cell({ r: fila, c: columna })] as CellLike | undefined)?.v;
      if (esCabeceraReferencia(valor)) {
        columnaReferencia = columna;
        filaCabecera = Math.max(filaCabecera, fila);
      }
      if (esCabeceraCliente(valor)) {
        columnaCliente = columna;
        filaCabecera = Math.max(filaCabecera, fila);
      }
      if (esCabeceraFecha(valor)) {
        columnaFecha = columna;
        filaCabecera = Math.max(filaCabecera, fila);
      }
    }
  }

  return {
    nombre,
    hoja,
    filaCabecera,
    inicioDatos: rango.s.r,
    finDatos: rango.e.r,
    columnasSerial,
    encabezados,
    columnaReferencia,
    columnaCliente,
    columnaFecha,
    porDatos: true,
  };
};

const detectarMetadatosGenerales = (
  libro: XLSX.WorkBook,
): { cliente?: string; fechaVenta?: string } => {
  let cliente: string | undefined;
  let fechaVenta: string | undefined;

  for (const nombre of libro.SheetNames) {
    const hoja = libro.Sheets[nombre];
    const referencia = hoja?.["!ref"];
    if (!hoja || !referencia) continue;
    const rango = XLSX.utils.decode_range(referencia);
    const finFila = Math.min(rango.e.r, rango.s.r + 14);
    const finColumna = Math.min(rango.e.c, rango.s.c + 14);

    for (let fila = rango.s.r; fila <= finFila; fila += 1) {
      for (let columna = rango.s.c; columna <= finColumna; columna += 1) {
        const valor = (hoja[XLSX.utils.encode_cell({ r: fila, c: columna })] as CellLike | undefined)?.v;
        const normalizado = normalizarCabecera(valor);
        const siguiente = columna < rango.e.c ? textoCelda(hoja, fila, columna + 1) : "";

        if (!cliente && esCabeceraCliente(valor) && siguiente && !esCabeceraConocida(siguiente)) {
          cliente = siguiente;
        }
        // Formato frecuente de los Excel de ventas: «REFERENCIA | Nombre del cliente».
        if (
          !cliente &&
          normalizado === "referencia" &&
          siguiente &&
          /[a-záéíóúñ]/i.test(siguiente) &&
          !/^\d+(?:[.,]\d+)?$/.test(siguiente) &&
          !esCabeceraConocida(siguiente)
        ) {
          cliente = siguiente;
        }
        if (!fechaVenta && esCabeceraFecha(valor) && siguiente) {
          fechaVenta = fechaDesdeCelda(hoja, fila, columna + 1) ?? normalizarFecha(siguiente);
        }
      }
    }
    if (cliente && fechaVenta) break;
  }

  return { cliente, fechaVenta };
};

/**
 * Detecta seriales tanto en columnas llamadas Serial/IMEI como en columnas cuyo
 * encabezado es la referencia del producto (como los Excel de ventas agrupados por modelo).
 * También conserva referencia, cliente, fecha y ubicación original para poder rastrear el dato.
 */
export const parseSerialWorkbook = (
  datos: ArrayBuffer,
  nombreArchivo = "",
): ParsedSerialWorkbook => {
  let libro: XLSX.WorkBook;
  try {
    libro = XLSX.read(datos, { type: "array", cellDates: false, dense: false });
  } catch {
    throw new SerialWorkbookError("invalid_file", "No se pudo leer el archivo.");
  }

  if (!libro.SheetNames.length) {
    throw new SerialWorkbookError("empty", "El archivo no contiene hojas.");
  }

  const detectadas = libro.SheetNames
    .map((nombre) => detectarHojaConEncabezado(libro, nombre))
    .filter((hoja): hoja is HojaDetectada => hoja !== null);

  const hojasConDatos = libro.SheetNames
    .filter((nombre) => !detectadas.some((hoja) => hoja.nombre === nombre))
    .map((nombre) => detectarColumnasPorDatos(libro, nombre))
    .filter((hoja): hoja is HojaDetectada => hoja !== null);

  let hojasUsadas = [...detectadas, ...hojasConDatos];
  let advertencia: ParsedSerialWorkbook["advertencia"];

  if (hojasUsadas.length === 0) {
    const nombre = libro.SheetNames[0];
    const hoja = libro.Sheets[nombre];
    const referencia = hoja?.["!ref"];
    if (!hoja || !referencia) throw new SerialWorkbookError("empty", "El archivo no contiene datos.");

    const rango = XLSX.utils.decode_range(referencia);
    let primeraColumna: number | undefined;
    for (let columna = rango.s.c; columna <= rango.e.c && primeraColumna === undefined; columna += 1) {
      for (let fila = rango.s.r; fila <= rango.e.r; fila += 1) {
        if (valorCelda(hoja, fila, columna, nombre)) {
          primeraColumna = columna;
          break;
        }
      }
    }
    if (primeraColumna === undefined) {
      throw new SerialWorkbookError("empty", "No se encontraron seriales en el archivo.");
    }
    hojasUsadas = [{
      nombre,
      hoja,
      filaCabecera: rango.s.r - 1,
      inicioDatos: rango.s.r,
      finDatos: rango.e.r,
      columnasSerial: [primeraColumna],
      encabezados: [XLSX.utils.encode_col(primeraColumna)],
    }];
    advertencia = "fallback_first_column";
  } else if (hojasUsadas.length < libro.SheetNames.length) {
    advertencia = "ignored_sheets";
  }

  const metadatos = detectarMetadatosGenerales(libro);
  const clienteDetectado = metadatos.cliente;
  const fechaVentaDetectada = metadatos.fechaVenta ?? fechaDesdeNombre(nombreArchivo);
  const registros: ParsedSerialRecord[] = [];
  const columnas: string[] = [];

  for (const detectada of hojasUsadas) {
    detectada.columnasSerial.forEach((columna, indice) => {
      columnas.push(
        `${detectada.nombre}: ${detectada.encabezados[indice] || XLSX.utils.encode_col(columna)}`,
      );
    });

    for (let fila = detectada.inicioDatos; fila <= detectada.finDatos; fila += 1) {
      for (let indice = 0; indice < detectada.columnasSerial.length; indice += 1) {
        const columna = detectada.columnasSerial[indice];
        const serial = valorCelda(detectada.hoja, fila, columna, detectada.nombre);
        if (!serial || (detectada.porDatos && !pareceSerial(serial))) continue;

        const encabezadoSerial = detectada.encabezados[indice] ?? "";
        const referenciaFila = detectada.columnaReferencia !== undefined
          ? valorCelda(detectada.hoja, fila, detectada.columnaReferencia, detectada.nombre)
          : "";
        const clienteFila = detectada.columnaCliente !== undefined
          ? valorCelda(detectada.hoja, fila, detectada.columnaCliente, detectada.nombre)
          : "";
        const fechaFila = detectada.columnaFecha !== undefined
          ? fechaDesdeCelda(detectada.hoja, fila, detectada.columnaFecha)
          : undefined;

        const encabezadoVenta = descomponerEncabezadoVenta(encabezadoSerial);
        const referenciaEncabezado = encabezadoVenta.referencia ||
          (!esCabeceraSerial(encabezadoSerial) &&
          !esCabeceraConocida(encabezadoSerial) &&
          !/^[A-Z]{1,3}$/.test(encabezadoSerial.trim())
            ? encabezadoSerial.trim()
            : "");
        const referencia = detectada.porDatos
          ? (referenciaEncabezado || referenciaFila)
          : (referenciaFila || referenciaEncabezado);

        registros.push({
          serial,
          referencia: referencia || undefined,
          cliente: clienteFila || encabezadoVenta.cliente || undefined,
          fechaVenta: fechaFila,
          hoja: detectada.nombre,
          fila: fila + 1,
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

  return {
    seriales: registros.map((registro) => registro.serial),
    registros,
    hojas: [...new Set(hojasUsadas.map((hoja) => hoja.nombre))],
    columnas,
    clienteDetectado,
    fechaVentaDetectada,
    advertencia,
  };
};
