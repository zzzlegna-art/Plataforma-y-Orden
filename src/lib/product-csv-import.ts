import * as XLSX from "xlsx-js-style";

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
  price: ["precio", "price", "precio ¶»§q«^