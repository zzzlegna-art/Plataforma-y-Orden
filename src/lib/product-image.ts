export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

export const PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ProductImageValidationError = "invalid_type" | "too_large";

export const validateProductImageFile = (
  file: Pick<File, "type" | "size">,
): ProductImageValidationError | undefined => {
  if (!(PRODUCT_IMAGE_TYPES as readonly string[]).includes(file.type)) return "invalid_type";
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) return "too_large";
  return undefined;
};

export const getProductImageExtension = (type: string): "jpg" | "png" | "webp" => {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
};
