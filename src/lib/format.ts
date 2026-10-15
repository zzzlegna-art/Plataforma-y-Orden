/** Formateo de moneda, números y fechas en español. */

import { hoyBogota } from "./dates";

/** Moneda de la aplicación: cambiar solo esta constante. */
export const APP_CURRENCY = "MXN";
export const APP_LOCALE = "es-MX";

const currencyFormatter = new Intl.NumberFormat(APP_LOCALE, {
  style: "currency",
  currency: APP_CURRENCY,
  minimumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat(APP_LOCALE);

export const formatCurrency = (value: number | undefined | null) =>
  currencyFormatter.format(Number(value ?? 0));

export const formatNumber = (value: number | undefined | null) =>
  numberFormatter.format(Number(value ?? 0));

/** Fecha corta a partir de un ISO string o "YYYY-MM-DD". */
export const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(APP_LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

/** Fecha y hora (para bitácora y movimientos). */
export const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(APP_LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

/** Fecha relativa sencilla: "hoy", "ayer", "hace 3 días". */
export const formatRelative = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (diffDays <= 0) return "hoy";
  if (diffDays === 1) return "ayer";
  if (diffDays < 30) return `hace ${diffDays} días`;
  return formatDate(value);
};

/**
 * Fecha de hoy en formato "YYYY-MM-DD" (inputs type=date y nombres de archivo), con la hora de
 * Bogotá: con la hora UTC, desde las 7pm ya sería "mañana".
 */
export const todayIso = () => hoyBogota();
