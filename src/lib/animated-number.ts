/**
 * Interpolación para animar un número que cambia de valor (por ejemplo, un indicador del
 * panel). Separado de React para poder probarlo sin depender de requestAnimationFrame.
 */

/** Suavizado: arranca rápido y frena al final (curva ease-out cúbica). */
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/**
 * Valor intermedio entre `desde` y `hasta` en el instante `elapsedMs` de una animación que
 * dura `durationMs`. Antes de empezar da `desde`; al terminar (o pasado el tiempo), `hasta`.
 */
export const valorIntermedio = (
  desde: number,
  hasta: number,
  elapsedMs: number,
  durationMs: number,
): number => {
  if (durationMs <= 0 || elapsedMs >= durationMs) return hasta;
  if (elapsedMs <= 0) return desde;
  const progreso = easeOutCubic(elapsedMs / durationMs);
  return desde + (hasta - desde) * progreso;
};
