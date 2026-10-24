export const MAX_PRODUCT_CSV_IMPORT_ROWS = 1_000;
export const MAX_PRODUCT_CSV_IMPORT_BYTES = 5 * 1024 * 1024;

export type ProductCsvRow = {
  rowNumber: number;
  name: string;
  sku: string;
  brand: string;
  category: string;
  description: string;
  imageUrl: string;
  features: string;
  price: number;
  cost: number;
  minStock: number;
  error?: string;
};

export type ProductCsvImportErrorCode = "empty" | "missing_name_column" | "too_many" | "malformed";

export class ProductCsvImportError extends Error {
  constructor(readonly code: ProductCsvImportErrorCode, message: string) {
    super(message);
    this.name = "ProductCsvImportError";
  }
}

const normalizeHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["producto", "product", "nombre", "name", "nombre del producto", "product name"],
  sku: ["referencia", "sku", "codigo", "code", "reference", "product code"],
  brand: ["marca", "brand", "fabricante", "manufacturer"],
  category: ["categoria", "category", "tipo", "type", "tipo de producto", "product type"],
  description: ["descripcion", "description", "detalle", "details"],
  imageUrl: ["enlace de imagen", "url de imagen", "imagen url", "image url", "image link", "url imagen", "imageurl"],
  price: ["precio", "price", "precio de venta", "sale price"],
  cost: ["costo", "cost", "coste"],
  minStock: ["stock minimo", "existencia minima", "existencias minimas", "minimum stock", "min stock"],
  features: ["caracteristicas", "caracteristicas tecnicas", "detalles tecnicos", "technical features", "technical details", "features"],
};

const detectarDelimitador = (text: string): string => {
  let enComillas = false;
  const conteo = new Map<string, number>([[ ";", 0 ], [",", 0], ["\t", 0]]);
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (enComillas && text[index + 1] === '"') {
        index += 1;
        continue;
      }
      enComillas = !enComillas;
      continue;
    }
    if (!enComillas && (character === "\n" || character === "\r")) break;
    if (!enComillas && conteo.has(character)) conteo.set(character, (conteo.get(character) ?? 0) + 1);
  }
  return [...conteo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ";";
};

const parseRecords = (text: string, delimiter: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && character === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }

  if (quoted) throw new ProductCsvImportError("malformed", "El CSV contiene comillas sin cerrar.");
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
};

const parseNumber = (value: string, field: string): { value: number; error?: string } => {
  const text = value.trim();
  if (!text) return { value: 0 };
  // Permite símbolos/códigos monetarios conocidos, pero no convierte texto arbitrario
  // como "12abc" o "COPX 100" en un importe aparentemente válido.
  const currencyCodes = "(?:COP|USD|EUR|MXN|ARS|CLP|PEN|BRL|CAD|AUD)";
  const withoutCurrency = text
    .replace(new RegExp(\`^\\s*\${currencyCodes}\\s*|\\s*\${currencyCodes}\\s*$\`, "i"), "")
    .replace(/^\\s*[$€£¥₹]\\s*|\\s*[$€£¥₹]\\s*$/g, "")
    .trim();
  if (/[a-z]/i.test(withoutCurrency)) {
    return { value: 0, error: `El campo ${field} debe ser un número mayor o igual a cero.` };
  }
  let cleaned = withoutCurrency.replace(/[^\d,.-]/g, "");
  if (!cleaned) {
    return {
      value: 0,
      error: `El campo ${field} debe ser un número mayor o igual a cero.`,
    };
  }

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? /\./g : /,/g;
    cleaned = cleaned.replace(thousandsSeparator, "");
    if (decimalSeparator === ",") cleaned = cleaned.replace(",", ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const separator = lastComma >= 0 ? "," : ".";
    const decimals = cleaned.length - cleaned.lastIndexOf(separator) - 1;
    if (decimals > 0 && decimals <= 2) {
      if (separator === ",") cleaned = cleaned.replace(",", ".");
    } else {
      cleaned = cleaned.replace(/[,.]/g, "");
    }
  }

  const number = Number(cleaned);
  if (!Number.isFinite(number) || number < 0) {
    return { value: 0, error: `El campo ${field} debe ser un número mayor o igual a cero.` };
  }
  return { value: number };
};

const findColumn = (headers: string[], field: keyof typeof HEADER_ALIASES) =>
  headers.findIndex((header) => HEADER_ALIASES[field].includes(normalizeHeader(header)));

const validarUrlImagen = (value: string): string | undefined => {
  const url = value.trim();
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? undefined
      : "El enlace de imagen debe comenzar por http:// o https://.";
  } catch {
    return "El enlace de imagen no es una URL válida.";
  }
};

/** Lee el CSV de catálogo exportado por Nexora o un archivo con cabeceras equivalentes. */
export const parseProductCsv = (text: string): ProductCsvRow[] => {
  if (!text.trim()) throw new ProductCsvImportError("empty", "El archivo está vacío.");
  const records = parseRecords(text.replace(/^\uFEFF/, ""), detectarDelimitador(text));
  if (records.length < 2) throw new ProductCsvImportError("empty", "El archivo no contiene productos para importar.");

  const headers = records[0].map((header) => header.trim());
  const fields = Object.keys(HEADER_ALIASES) as (keyof typeof HEADER_ALIASES)[];
  const recognizedColumns = new Map<keyof typeof HEADER_ALIASES, number[]>();
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const field = fields.find((candidate) => HEADER_ALIASES[candidate].includes(normalized));
    if (!field) return;
    const indexes = recognizedColumns.get(field) ?? [];
    indexes.push(index);
    recognizedColumns.set(field, indexes);
  });
  const duplicatedFields = [...recognizedColumns.entries()]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([field]) => HEADER_ALIASES[field][0]);
  if (duplicatedFields.length) {
    throw new ProductCsvImportError(
      "malformed",
      `El CSV contiene columnas repetidas para: ${duplicatedFields.join(", ")}. Deja una sola columna por campo.`,
    );
  }
  const columns = Object.fromEntries(
    fields.map((field) => [field, findColumn(headers, field)]),
  ) as Record<keyof typeof HEADER_ALIASES, number>;

  if (columns.name < 0) {
    throw new ProductCsvImportError("missing_name_column", "No se encontró una columna Producto o Nombre.");
  }

  const dataRows = records.slice(1);
  if (dataRows.length > MAX_PRODUCT_CSV_IMPORT_ROWS) {
    throw new ProductCsvImportError(
      "too_many",
      `El archivo supera el límite de ${MAX_PRODUCT_CSV_IMPORT_ROWS.toLocaleString("es-CO")} productos por importación.`,
    );
  }

  return dataRows.map((values, index) => {
    const get = (key: keyof typeof HEADER_ALIASES) =>
      columns[key] >= 0 ? (values[columns[key]] ?? "").trim() : "";
    const name = get("name");
    const price = parseNumber(get("price"), "precio");
    const cost = parseNumber(get("cost"), "costo");
    const minStock = parseNumber(get("minStock"), "stock mínimo");
    const imageUrl = get("imageUrl");
    const errors = [
      values.length > headers.length
        ? `La fila contiene más columnas (${values.length}) que la cabecera (${headers.length}); revisa los separadores y las comillas.`
        : undefined,
      !name ? "El nombre del producto es obligatorio." : undefined,
      get("sku").length > 40 ? "La referencia no puede superar los 40 caracteres." : undefined,
      price.error,
      cost.error,
      minStock.error,
      Number.isInteger(minStock.value)
        ? undefined
        : "El campo stock mínimo debe ser un número entero mayor o igual a cero.",
      validarUrlImagen(imageUrl),
    ].filter((error): error is string => Boolean(error));

    return {
      rowNumber: index + 2,
      name,
      sku: get("sku").toUpperCase(),
      brand: get("brand"),
      category: get("category"),
      description: get("description"),
      imageUrl,
      features: get("features"),
      price: price.value,
      cost: cost.value,
      minStock: minStock.value,
      error: errors.join(" "),
    };
  });
};
