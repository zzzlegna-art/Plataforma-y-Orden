/**
 * Garantías recién recibidas por la persona que usa la pantalla. Sirve para desplegar
 * automáticamente el lote donde entraron; el resto de lotes se queda cerrado.
 *
 * `conocidas` son los ids que ya se habían visto: se compara contra ellos para detectar solo
 * lo que acaba de aparecer (las que ya existían al abrir la pantalla nunca cuentan).
 */
export const garantiasNuevasDeUsuario = <T extends { id: string; status: string; createdBy: string }>(
  conocidas: ReadonlySet<string>,
  garantias: T[],
  userId: string | undefined,
): T[] =>
  garantias.filter(
    (garantia) =>
      !conocidas.has(garantia.id) && garantia.status === "recibido" && garantia.createdBy === userId,
  );
