import type { ProductTechnicalSpecs, ProductColorVariant } from "./types";

export interface ProductFormValues {
  sku: string;
  name: string;
  description: string;
  categoryId: string;
  brandId: string;
  categoria: string;
  price: string;
  cost: string;
  minStock: string;
  isActive: boolean;
}

export interface ProductFormDraft {
  version: 1;
  form: ProductFormValues;
  technicalSpecs: ProductTechnicalSpecs;
  colorVariants?: ProductColorVariant[];
  skuManual: boolean;
  removeImage: boolean;
}

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  sku: "",
  name: "",
  description: "",
  categoryId: "",
  brandId: "",
  categoria: "",
  price: "0",
  cost: "0",
  minStock: "0",
  isActive: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

const resolveStorage = (storage?: DraftStorage): DraftStorage | null => {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

/** Cada usuario y producto conserva su borrador aislado durante la sesión del navegador. */
export const getProductFormDraftKey = (
  productId?: string | null,
  userId?: string | null,
): string =>
  `nexora:product-form-draft:v1:${encodeURIComponent(userId ?? "anonymous")}:${encodeURIComponent(productId ?? "new")}`;

export const readProductFormDraft = (
  key: string,
  storage?: DraftStorage,
): ProductFormDraft | null => {
  const target = resolveStorage(storage);
  if (!target) return null;

  try {
    const raw = target.getItem(key);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.form)) return null;

    const values = parsed.form;
    const technicalSpecs = isRecord(parsed.technicalSpecs)
      ? (parsed.technicalSpecs as ProductTechnicalSpecs)
      : {};

    return {
      version: 1,
      form: {
        sku: asString(values.sku, EMPTY_PRODUCT_FORM.sku),
        name: asString(values.name, EMPTY_PRODUCT_FORM.name),
        description: asString(values.description, EMPTY_PRODUCT_FORM.description),
        categoryId: asString(values.categoryId, EMPTY_PRODUCT_FORM.categoryId),
        brandId: asString(values.brandId, EMPTY_PRODUCT_FORM.brandId),
        categoria: asString(values.categoria, EMPTY_PRODUCT_FORM.categoria),
        price: asString(values.price, EMPTY_PRODUCT_FORM.price),
        cost: asString(values.cost, EMPTY_PRODUCT_FORM.cost),
        minStock: asString(values.minStock, EMPTY_PRODUCT_FORM.minStock),
        isActive: typeof values.isActive === "boolean" ? values.isActive : EMPTY_PRODUCT_FORM.isActive,
      },
      technicalSpecs,
      colorVariants: Array.isArray(parsed.colorVariants)
        ? (parsed.colorVariants as ProductColorVariant[])
        : undefined,
      skuManual: typeof parsed.skuManual === "boolean" ? parsed.skuManual : false,
      removeImage: typeof parsed.removeImage === "boolean" ? parsed.removeImage : false,
    };
  } catch {
    return null;
  }
};

export const writeProductFormDraft = (
  key: string,
  draft: ProductFormDraft,
  storage?: DraftStorage,
): boolean => {
  const target = resolveStorage(storage);
  if (!target) return false;

  try {
    target.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    // El formulario debe seguir funcionando aunque el navegador bloquee el almacenamiento.
    return false;
  }
};

export const clearProductFormDraft = (
  key: string,
  storage?: DraftStorage,
): void => {
  const target = resolveStorage(storage);
  if (!target) return;

  try {
    target.removeItem(key);
  } catch {
    // Limpiar un borrador es secundario al guardado del producto.
  }
};
