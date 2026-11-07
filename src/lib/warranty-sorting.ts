import type { WarrantyView } from "./selectors";

/** Comparador natural para ordenar referencias de menor a mayor modelo y capacidad. */
const collatorReferencias = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});

/** Orden ascendente por referencia/modelo; los registros sin referencia quedan al final. */
export const compararReferenciasGarantia = (a: string, b: string): number => {
  const referenciaA = a.trim();
  const referenciaB = b.trim();
  if (!referenciaA) return referenciaB ? 1 : 0;
  if (!referenciaB) return -1;
  return collatorReferencias.compare(referenciaA, referenciaB);
};

export const ordenarReferenciasGarantia = <T extends string>(referencias: readonly T[]): T[] =>
  [...referencias].sort(compararReferenciasGarantia);

export const nombreReferenciaGarantia = (
  view: Pick<WarrantyView, "product" | "warranty">,
): string => (view.product?.name ?? view.warranty.referenciaManual ?? "").trim();

/** Compara dos casos únicamente por su referencia; permite definir desempates por pestaña. */
export const compararVistasGarantiaPorReferencia = (
  a: Pick<WarrantyView, "product" | "warranty">,
  b: Pick<WarrantyView, "product" | "warranty">,
): number =>
  compararReferenciasGarantia(nombreReferenciaGarantia(a), nombreReferenciaGarantia(b));

/** Orden ascendente por modelo/capacidad y, dentro de la misma referencia, por recepción más reciente. */
export const ordenarVistasGarantiaPorReferencia = <T extends Pick<WarrantyView, "product" | "warranty">>(
  vistas: readonly T[],
): T[] =>
  [...vistas].sort(
    (a, b) =>
      compararVistasGarantiaPorReferencia(a, b) ||
      b.warranty.receivedAt.localeCompare(a.warranty.receivedAt) ||
      b.warranty.code.localeCompare(a.warranty.code, "es", { numeric: true }),
  );
