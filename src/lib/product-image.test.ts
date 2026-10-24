import { describe, expect, it } from "vitest";

import {
  getProductImageExtension,
  MAX_PRODUCT_IMAGE_BYTES,
  validateProductImageFile,
} from "./product-image";

describe("validación de fotografías de productos", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("acepta el formato %s", (type) => {
    expect(validateProductImageFile({ type, size: 1024 })).toBeUndefined();
  });

  it("acepta el tamaño máximo permitido", () => {
    expect(validateProductImageFile({ type: "image/jpeg", size: MAX_PRODUCT_IMAGE_BYTES })).toBeUndefined();
  });

  it("rechaza SVG, GIF y otros formatos no admitidos", () => {
    expect(validateProductImageFile({ type: "image/svg+xml", size: 1024 })).toBe("invalid_type");
    expect(validateProductImageFile({ type: "image/gif", size: 1024 })).toBe("invalid_type");
  });

  it("rechaza fotografías mayores de 5 MB", () => {
    expect(validateProductImageFile({ type: "image/png", size: MAX_PRODUCT_IMAGE_BYTES + 1 })).toBe("too_large");
  });

  it("mantiene extensiones coherentes con el MIME al subir la imagen", () => {
    expect(getProductImageExtension("image/jpeg")).toBe("jpg");
    expect(getProductImageExtension("image/png")).toBe("png");
    expect(getProductImageExtension("image/webp")).toBe("webp");
  });
});
