import type { Product, ProductColorVariant } from "./types";

/** Un mismo modelo/SKU puede ofrecer distintas tarifas según el color. */
export const normalizarColor = (value?: string | null) => (value ?? "").trim().replace(/\s+/g, " ");

export const variantePorColor = (producto: Pick<Product, "colorVariants"> | undefined, color?: string | null): ProductColorVariant | undefined => {
  const key = normalizarColor(color).toLocaleLowerCase("es");
  if (!key) return undefined;
  return producto?.colorVariants?.find((v) => normalizarColor(v.color).toLocaleLowerCase("es") === key);
};

/**
 * El aviso de precio pendiente depende de la tarifa de color guardada en el
 * catálogo, NO del precio unitario que quedó en un pedido anterior.
 * Una tarifa existente con un precio distinto indica desincronización, no ausencia.
 */
export const estadoPrecioVentaColor = (
  producto: Pick<Product, "colorVariants"> | undefined,
  color: string | null | undefined,
  precioPedido: number,
): "sin_color" | "pendiente" | "desactualizado" | "actualizado" => {
  const variante = variantePorColor(producto, color);
  if (!variante) return "sin_color";
  if (!Number.isFinite(variante.price) || variante.price <= 0) return "pendiente";
  return variante.price === precioPedido ? "actualizado" : "desactualizado";
};

/** Mantener tarifa base para equipos históricos sin color; jamás inferir colores por nombre. */
export const precioSugeridoColor = (producto: Pick<Product, "price" | "colorVariants">, color?: string | null): number =>
  variantePorColor(producto, color)?.price ?? producto.price;

export const costoSugeridoColor = (producto: Pick<Product, "cost" | "colorVariants">, color?: string | null): number =>
  variantePorColor(producto, color)?.cost ?? producto.cost;

/** Número de unidades en existencia (sin las ya apartadas) por color, para orientar la captura. */
export const stockPorColor = (
  productId: string,
  color: string,
  units: readonly { productId: string; color?: string; status: string; id: string }[],
  asignados: ReadonlySet<string> = new Set(),
): number => units.filter((u) =>
  u.productId === productId &&
  (u.status === "en_bodega" || u.status === "en_local") &&
  !asignados.has(u.id) &&
  normalizarColor(u.color).toLocaleLowerCase("es") === normalizarColor(color).toLocaleLowerCase("es"),
).length;
