/**
 * Neutraliza valores de texto que una hoja de cálculo interpretaría como fórmulas.
 * Se aplica antes de entrecomillar para CSV separado por punto y coma.
 */
export const celdaCsvSegura = (valor: string | number): string => {
  const texto = String(valor);
  const seguro = /^[\s\uFEFF]*[=+\-@]/u.test(texto) ? "'" + texto : texto;
  return '"' + seguro.replace(/"/g, '""') + '"';
};

export const crearCsv = (filas: (string | number)[][]): string =>
  "\uFEFF" + filas.map((fila) => fila.map(celdaCsvSegura).join(";")).join("\r\n");
