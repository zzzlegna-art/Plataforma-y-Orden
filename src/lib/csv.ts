/**
 * Neutraliza valores de texto que una hoja de cálculo interpretaría como fórmulas.
 * Se aplica antes de entrecomillar para CSV separado por punto y coma.
 */
export const celdaCsvSegura = (valor: string | number): string => {
  const texto = String(valor);
  const seguro = typeof valor === "number" && Number.isFinite(valor)
    ? texto
    : /^[\s\uFEFF]*[=+\-@]/u.test(texto) ? "'" + texto : texto;
  return '"' + seguro.replace(/"/g, '""') + '"';
};

export const crearCsv = (filas: (string | number)[][]): string =>
  "\uFEFF" + filas.map((fila) => fila.map(celdaCsvSegura).join(";")).join("\r\n");


/** Descarga un CSV UTF-8 con BOM para abrirlo correctamente en Excel. */
export const descargarCsv = (filename: string, filas: (string | number)[][]): void => {
  const blob = new Blob([crearCsv(filas)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
