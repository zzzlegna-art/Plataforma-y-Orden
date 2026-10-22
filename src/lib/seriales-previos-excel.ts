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

export type ParsedSerialWorkbook = {
  seriales: string[];
  hojas: string[];
  columnas: string[];
  advertencia?: "fallback_first_column" | "ignored_sheets";
};

type CellLike = { v?: unknown; w?: string; t?: string };

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

type HojaDetectada = {
  nombre: string;
  hoja: XLSX.WorkSheet;
  inicioDatos: number;
  columnas: number[];
  encabezados: string[];
  filaInicio: number;
  filaFin: number;
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
    const columnas = [];
    const encabezados = [];
    for (let columna = rango.s.c; columna <= rango.e.c; columna += 1) {
      const direccion = XLSX.utils.encode_cell({ r: fila, c: columna });
      const valor = (hoja[direccion] as CellLike | undefined)?.v;
      if (esCabeceraSerial(valor)) {
        columnas.push(columna);
        encabezados.push(String(valor).trim() || XLSX.utils.encode_col(columna));
      }
    }
    if (columnas.length > 0) {
      return {
        nombre,
        hoja,
        inicioDatos: fila + 1,
        columnas,
        encabezados,
        filaInicio: rango.s.r,
        filaFin: rango.e.r,
      };
    }
  }
  return null;
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
          inicioDatos: rango.s.r,
          columnas: [columna],
          encabezados: [XLSX.utils.encode_col(columna)],
          filaInicio: rango.s.r,
          filaFin: rango.e.r,
        };
      }
    }
  }
  return null;
};

/**
 * Lee las columnas que parecen contener seriales/IMEI. Si el libro no tiene
 * encabezados reconocibles, usa la primera columna de la primera hoja y lo
 * informa para que el usuario pueda comprobar la vista previa antes de guardar.
 */
export const parseSerialWorkbook = (datos: ArrayBuffer): ParsedSerialWorkbook => {
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

  const hojasUsadas = detectadas.length > 0
    ? detectadas
    : [detectarPrimeraColumna(libro, libro.SheetNames[0])].filter(
        (hoja): hoja is HojaDetectada => hoja !== null,
      );

  const seriales: string[] = [];
  const columnas: string[] = [];

  for (const detectada of hojasUsadas) {
    detectada.columnas.forEach((columna, indice) => {
      columnas.push(
        `${detectada.nombre}: ${detectada.encabezados[indice] || XLSX.utils.encode_col(columna)}`,
      );
    });

    for (let fila = detectada.inicioDatos; fila <= detectada.filaFin; fila += 1) {
      for (const columna of detectada.columnas) {
        const serial = valorCelda(detectada.hoja, fila, columna, detectada.nombre);
        if (!serial) continue;
        seriales.push(serial);
        if (seriales.length > MAX_SERIAL_IMPORT) {
          throw new SerialWorkbookError(
            "too_many",
            `El archivo supera el límite de ${MAX_SERIAL_IMPORT.toLocaleString("es-CO")} seriales.`,
          );
        }
      }
    }
  }

  if (seriales.length === 0) {
    throw new SerialWorkbookError("empty", "No se encontraron seriales en las columnas detectadas.");
  }

  const advertencia =
    detectadas.length === 0
      ? "fallback_first_column"
      : detectadas.length < libro.SheetNames.length
        ? "ignored_sheets"
        : undefined;

  return {
    seriales,
    hojas: hojasUsadas.map((hoja) => hoja.nombre),
    columnas,
    advertencia,
  };
};
