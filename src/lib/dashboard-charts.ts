import type { CustomerRanking, ProductRanking } from "./selectors";

/** Un punto de las gráficas de ranking del panel (productos más vendidos, clientes que más compran). */
export interface RankDatum {
  key: string;
  name: string;
  short: string;
  value: number;
  units: number;
}

/**
 * Porcentaje real que representa un valor dentro del total del ranking.
 * Se usa tanto para el ancho de la barra como para que las etiquetas coincidan.
 */
export const getRankSharePercent = (value: number, total: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(total) || value <= 0 || total <= 0) return 0;
  return Math.min(100, (value / total) * 100);
};

/** Etiqueta corta para el eje de las barras. */
export const shortenRankLabel = (name: string, max = 12): string =>
  name.length > max ? `${name.slice(0, max - 1)}…` : name;

export const rankDatumsDeProductos = (topProducts: ProductRanking[]): RankDatum[] =>
  topProducts.map((row) => ({
    key: row.product.id,
    name: row.product.name,
    short: shortenRankLabel(row.product.name),
    value: row.quantity,
    units: row.quantity,
  }));

/**
 * Texto con los valores que de verdad se ven en la gráfica de productos (id y cantidad, en
 * orden). `db` cambia de referencia con cualquier evento en vivo, así que `topProducts` es un
 * arreglo nuevo en cada actualización del panel aunque los números no hayan cambiado; esta
 * firma sirve para que la gráfica solo se vuelva a calcular cuando algo realmente cambió —
 * dos textos iguales son siempre el mismo valor para React, aunque vengan de arreglos
 * distintos, así que un `useMemo` atado a esta firma evita pasarle a Recharts un dato "nuevo"
 * a mitad de la animación de entrada por una actualización que no le afecta.
 */
export const firmaRankProductos = (topProducts: ProductRanking[]): string =>
  topProducts.map((row) => `${row.product.id}:${row.quantity}`).join("|");

export const rankDatumsDeClientes = (topCustomers: CustomerRanking[], porMonto: boolean): RankDatum[] =>
  topCustomers.map((row) => ({
    key: row.customer?.id ?? row.customer?.name ?? "sin-cliente",
    name: row.customer?.name ?? "—",
    short: shortenRankLabel(row.customer?.name ?? "—"),
    value: porMonto ? row.total : row.units,
    units: row.units,
  }));

/** Igual que {@link firmaRankProductos}, para la gráfica de clientes. */
export const firmaRankClientes = (topCustomers: CustomerRanking[], porMonto: boolean): string =>
  `${porMonto ? "monto" : "unidades"}|` +
  topCustomers
    .map((row) => `${row.customer?.id ?? row.customer?.name ?? "sin-cliente"}:${porMonto ? row.total : row.units}`)
    .join("|");
