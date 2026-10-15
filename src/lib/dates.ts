/**
 * Fechas "de calendario" (un día, sin hora): fecha del pedido, fecha de entrega. Se guardan en
 * la base en una columna con hora (creada como medianoche), así que hay que tener cuidado en
 * dos puntos:
 *
 *  - Al escribir: "hoy" se calcula con la hora de Bogotá (la del negocio), igual que hace el
 *    servidor al generar los códigos PED-YYMMDD. Si se usara la hora UTC, entre las 7pm y la
 *    medianoche en Bogotá ya sería "mañana" en UTC.
 *  - Al leer: Postgres siempre devuelve esa medianoche en UTC (por eso el texto termina en
 *    "T00:00:00+00:00"), así que basta con tomar los primeros 10 caracteres. Si en cambio se
 *    deja que el navegador reinterprete la fecha completa con su propia hora local, un
 *    visitante en Bogotá (5 horas detrás de UTC) ve esa medianoche como las 7pm del día
 *    anterior y la fecha retrocede un día.
 */

const ZONA_NEGOCIO = "America/Bogota";

/** Día de calendario (YYYY-MM-DD) de un instante, en la zona horaria del negocio. */
export const diaBogota = (iso: string): string => {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_NEGOCIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const de = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${de("year")}-${de("month")}-${de("day")}`;
};

/** El día de hoy (YYYY-MM-DD) en la zona horaria del negocio. */
export const hoyBogota = (): string => diaBogota(new Date().toISOString());

/**
 * Recorta un valor leído del servidor a solo su fecha de calendario (YYYY-MM-DD), sin dejar
 * que se reinterprete con la hora del navegador. Postgres devuelve las columnas con hora ya
 * en UTC, así que tomar los primeros 10 caracteres del texto basta y es más seguro que volver
 * a construir un Date.
 */
export const soloFecha = (valor: unknown): string | undefined => {
  const texto = typeof valor === "string" ? valor : undefined;
  return texto && texto.length >= 10 ? texto.slice(0, 10) : undefined;
};
