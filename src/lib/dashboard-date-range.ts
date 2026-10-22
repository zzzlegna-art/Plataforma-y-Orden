export interface DashboardMovement {
  createdAt: string;
  type: string;
  quantity: number;
}

export interface DashboardMovementPoint {
  key: string;
  label: string;
  entradas: number;
  salidas: number;
  devoluciones: number;
}

/** Formatea una fecha de calendario local para inputs HTML, sin convertirla a UTC. */
export const getLocalDateInputValue = (date: Date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const parseDateKey = (value: string): { year: number; month: number; day: number; ordinal: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day, ordinal: Math.floor(date.getTime() / 86_400_000) };
};

const dateKeyFromOrdinal = (ordinal: number): string => {
  const date = new Date(ordinal * 86_400_000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

const mondayKeyFromOrdinal = (ordinal: number): string => {
  const weekday = new Date(ordinal * 86_400_000).getUTCDay();
  return dateKeyFromOrdinal(ordinal - ((weekday + 6) % 7));
};

/** Filtro inclusivo compartido por la gráfica y los informes CSV/Excel. */
export const isWithinDateRange = (value: string | undefined, desde: string, hasta: string): boolean => {
  if (!value) return false;
  const day = value.slice(0, 10);
  if (!parseDateKey(day)) return false;
  return (!desde || day >= desde) && (!hasta || day <= hasta);
};

/**
 * Construye la serie del gráfico con el mismo filtro inclusivo que los informes.
 * Los rangos mayores de 31 días se agrupan por semana sin truncar a 366 días.
 * Si un extremo está vacío, el gráfico usa el primer/último movimiento disponible.
 */
export const buildDashboardMovementChartData = (
  movements: readonly DashboardMovement[],
  desde: string,
  hasta: string,
  today: Date = new Date(),
): DashboardMovementPoint[] => {
  if (desde && hasta && desde > hasta) return [];

  const filtered = movements.filter((movement) => isWithinDateRange(movement.createdAt, desde, hasta));
  const movementDays = filtered
    .map((movement) => movement.createdAt.slice(0, 10))
    .filter((day) => parseDateKey(day) !== null)
    .sort();

  const fromKey = desde || movementDays[0] || hasta || getLocalDateInputValue(today);
  const toKey = hasta || movementDays[movementDays.length - 1] || desde || fromKey;
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  if (!from || !to || from.ordinal > to.ordinal) return [];

  const daysCount = to.ordinal - from.ordinal + 1;
  const weekly = daysCount > 31;
  const buckets = new Map<string, DashboardMovementPoint>();

  for (let ordinal = from.ordinal; ordinal <= to.ordinal; ordinal += 1) {
    const dayKey = dateKeyFromOrdinal(ordinal);
    const key = weekly ? mondayKeyFromOrdinal(ordinal) : dayKey;
    if (buckets.has(key)) continue;
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(year, month - 1, day, 12);
    buckets.set(key, {
      key,
      label: new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" })
        .format(date)
        .replace(/\.$/, ""),
      entradas: 0,
      salidas: 0,
      devoluciones: 0,
    });
  }

  for (const movement of filtered) {
    const movementKey = movement.createdAt.slice(0, 10);
    const parsed = parseDateKey(movementKey);
    if (!parsed) continue;
    const key = weekly ? mondayKeyFromOrdinal(parsed.ordinal) : movementKey;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (movement.type === "entrada") bucket.entradas += movement.quantity;
    else if (movement.type === "salida") bucket.salidas += movement.quantity;
    else if (movement.type === "devolucion") bucket.devoluciones += movement.quantity;
  }

  return [...buckets.values()];
};
