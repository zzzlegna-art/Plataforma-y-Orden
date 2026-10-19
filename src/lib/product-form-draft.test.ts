import { describe, expect, it } from "vitest";

import {
  clearProductFormDraft,
  getProductFormDraftKey,
  readProductFormDraft,
  writeProductFormDraft,
  type ProductFormDraft,
} from "./product-form-draft";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const sampleDraft: ProductFormDraft = {
  version: 1,
  form: {
    sku: "IPHONE-13-128",
    name: "iPhone 13",
    description: "Equipo de prueba",
    categoryId: "phones",
    brandId: "apple",
    categoria: "celular",
    price: "1200000",
    cost: "900000",
    minStock: "2",
    isActive: true,
  },
  technicalSpecs: {
    storage: "128 GB",
    ram: "4 GB",
    customFields: [{ id: "custom-1", name: "Color", value: "Azul" }],
  },
  skuManual: true,
  removeImage: false,
};

describe("product form drafts", () => {
  it("separa borradores por usuario y producto", () => {
    expect(getProductFormDraftKey("p1", "u1")).not.toBe(getProductFormDraftKey("p2", "u1"));
    expect(getProductFormDraftKey("p1", "u1")).not.toBe(getProductFormDraftKey("p1", "u2"));
    expect(getProductFormDraftKey(null, "u1")).not.toBe(getProductFormDraftKey(null, "u2"));
  });

  it("recupera la referencia y las características técnicas completas", () => {
    const storage = new MemoryStorage();
    const key = getProductFormDraftKey("p1", "u1");

    expect(writeProductFormDraft(key, sampleDraft, storage)).toBe(true);
    expect(readProductFormDraft(key, storage)).toEqual(sampleDraft);
  });

  it("ignora borradores dañados o de una versión desconocida", () => {
    const storage = new MemoryStorage();
    const key = getProductFormDraftKey("p1", "u1");
    storage.setItem(key, "{not-json");
    expect(readProductFormDraft(key, storage)).toBeNull();

    storage.setItem(key, JSON.stringify({ version: 99, form: sampleDraft.form }));
    expect(readProductFormDraft(key, storage)).toBeNull();
  });

  it("elimina el borrador después de guardar", () => {
    const storage = new MemoryStorage();
    const key = getProductFormDraftKey("p1", "u1");
    writeProductFormDraft(key, sampleDraft, storage);

    clearProductFormDraft(key, storage);

    expect(readProductFormDraft(key, storage)).toBeNull();
  });

  it("no lanza errores si el almacenamiento está bloqueado", () => {
    const blockedStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const key = getProductFormDraftKey("p1", "u1");

    expect(readProductFormDraft(key, blockedStorage)).toBeNull();
    expect(writeProductFormDraft(key, sampleDraft, blockedStorage)).toBe(false);
    expect(() => clearProductFormDraft(key, blockedStorage)).not.toThrow();
  });
});
