/**
 * Abre un enlace en una pestaña/app nueva simulando un clic real (en vez de `window.open`),
 * que dentro de la app instalada (PWA) puede no hacer nada, igual que pasaba antes al
 * imprimir etiquetas: sin una "pestaña" de navegador donde abrir algo, la llamada por script
 * se queda sin efecto y no avisa de nada.
 */
export const abrirEnlaceExterno = (url: string): void => {
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.target = "_blank";
  enlace.rel = "noopener noreferrer";
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
};

