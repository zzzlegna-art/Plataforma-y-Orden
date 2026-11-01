import type { OrderLineView } from "@/lib/selectors";

const comparadorNatural = new Intl.Collator("es-CO", {
  numeric: true,
  sensitivity: "base",
});

const prioridadCondicion: Record<string, number> = {
  nuevo: 0,
  seminuevo: 1,
};

/**
 * Orden de presentación de las referencias en un pedido.
 * La comparación numérica natural mantiene juntos y en secuencia modelos como
 * iPhone 13, iPhone 14, iPhone 15 y iPhone 17, independientemente del orden
 * en que se agregaron al pedido. No modifica las líneas ni los datos guardados.
 */
export const ordenarLineasPedido = (
  lines: readonly OrderLineView[],
): OrderLineView[] =>
  lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      const nombreA = a.line.product?.name?.trim() ?? "";
      const nombreB = b.line.product?.name?.trim() ?? "";
      if (!nombreA && nombreB) return 1;
      if (nombreA && !nombreB) return -1;

      const porNombre = comparadorNatural.compare(nombreA, nombreB);
      if (porNombre !== 0) return porNombre;

      const porSku = comparadorNatural.compare(
        a.line.product?.sku ?? "",
        b.line.product?.sku ?? "",
      );
      if (porSku !== 0) return porSku;

      const condicionA = prioridadCondicion[a.line.item.condition ?? ""] ?? 2;
      const condicionB = prioridadCondicion[b.line.item.condition ?? ""] ?? 2;
      if (condicionA !== condicionB) return condicionA - condicionB;

      const porColor = comparadorNatural.compare(
        a.line.item.color ?? "",
        b.line.item.color ?? "",
      );
      if (porColor !== 0) return porColor;

      // Si todo coincide, conserva el orden original para no mover líneas equivalentes.
      return a.index - b.index;
    })
    .map(({ line }) => line);
