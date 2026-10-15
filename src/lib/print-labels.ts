import JsBarcode from "jsbarcode";

import { esCodigoInterno } from "./imei";

/** Una etiqueta: nombre de la referencia y el serial/IMEI que lleva el código de barras. */
export interface EtiquetaSerial {
  producto: string;
  serial: string;
  /** Novedad puntual, escrita al momento de imprimir (ej. "Devolución Camilo"). No se guarda en ningún lado. */
  nota?: string;
}

/** Tamaño de la etiqueta en rollo térmico continuo, igual al de la plantilla de la bodega. */
const ANCHO_MM = 56;
const ALTO_MM = 40;

/** SVG del código de barras (CODE128) de un serial. Cadena vacía si el valor no es válido. */
export const generarSvgCodigoBarras = (valor: string): string => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    // displayValue: false — jsbarcode dibuja el número debajo del código por su cuenta, y la
    // etiqueta ya lo repite aparte en grande (ver .serial en htmlDeEtiqueta); sin esto salía
    // dos veces, una encima de la otra.
    JsBarcode(svg, valor, { format: "CODE128", height: 60, width: 2, margin: 8, displayValue: false });
  } catch {
    return "";
  }
  return svg.outerHTML;
};

const escaparHtml = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/**
 * Tamaño del nombre del producto según su largo: uno corto ("iPad") se ve más grande, uno
 * largo se achica para no desbordar el marco de la etiqueta.
 */
export const tamanoNombre = (producto: string): number => {
  const largo = producto.length;
  if (largo <= 18) return 13;
  if (largo <= 26) return 11;
  if (largo <= 34) return 9.5;
  return 8;
};

const htmlDeEtiqueta = ({ producto, serial, nota }: EtiquetaSerial) => `
  <div class="etiqueta">
    <div class="marco">
      <div class="producto" style="font-size:${tamanoNombre(producto)}px">${escaparHtml(producto)}</div>
      <div class="linea"></div>
      <div class="codigo">${generarSvgCodigoBarras(serial)}</div>
      <div class="serial">${escaparHtml(serial)}</div>
      ${esCodigoInterno(serial) ? '<div class="aviso">Serial generado, pendiente IMEI</div>' : ""}
      ${nota?.trim() ? `<div class="nota">${escaparHtml(nota.trim())}</div>` : ""}
      <div class="marca" aria-hidden="true">6A</div>
    </div>
  </div>`;

const htmlDeDocumento = (etiquetas: EtiquetaSerial[]): string => {
  const titulo = etiquetas.length === 1 ? `Etiqueta ${etiquetas[0].serial}` : `${etiquetas.length} etiquetas`;
  return `
    <html><head><title>${escaparHtml(titulo)}</title>
    <style>
      @page { size: ${ANCHO_MM}mm ${ALTO_MM}mm; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; }
      .etiqueta {
        width: ${ANCHO_MM}mm; height: ${ALTO_MM}mm;
        padding: 1.5mm;
        page-break-after: always; break-after: page;
      }
      .etiqueta:last-child { page-break-after: auto; break-after: auto; }
      .marco {
        width: 100%; height: 100%; position: relative;
        border: 0.4mm solid #000; border-radius: 2mm;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        /* padding-bottom reserva el espacio de la marca 6A: así el bloque de texto se centra
           en el resto del alto y nunca queda a la misma altura que el círculo, sin importar
           cuántos dígitos tenga el serial (un IMEI de 15 dígitos es bien ancho). */
        gap: 1mm; padding: 1.5mm 1.5mm 8mm; text-align: center;
      }
      .producto { font-family: Helvetica, Arial, sans-serif; font-weight: bold; line-height: 1.15; }
      .linea { width: 85%; height: 0; border-top: 0.3mm solid #000; }
      .codigo svg { max-width: 92%; height: auto; }
      .serial { font-family: ui-monospace, Menlo, monospace; font-weight: bold; font-size: 13px; letter-spacing: 0.12em; }
      .aviso { font-family: Helvetica, Arial, sans-serif; font-size: 8.5px; font-weight: 700; color: #000; }
      .nota { font-family: Helvetica, Arial, sans-serif; font-size: 9px; font-style: italic; color: #000; max-width: 92%; }
      .marca {
        position: absolute; left: 1.5mm; bottom: 1.5mm;
        width: 6mm; height: 6mm; border-radius: 50%; border: 0.3mm solid #000;
        display: flex; align-items: center; justify-content: center;
        font-family: Helvetica, Arial, sans-serif; font-weight: bold; font-size: 7px;
      }
    </style>
    </head><body>${etiquetas.map(htmlDeEtiqueta).join("")}</body></html>`;
};

/**
 * Abre el diálogo de impresión con una etiqueta por cada serial dado, en el tamaño del rollo
 * térmico (una etiqueta = una página, para que la impresora avance el rollo sola entre una y
 * otra). No hace nada si la lista viene vacía.
 *
 * Usa un iframe oculto en la misma página, en vez de una ventana nueva (`window.open`): así no
 * depende de que el navegador permita ventanas emergentes, algo que en el celular suele venir
 * bloqueado de fábrica y hacía que, al pulsar "Imprimir etiquetas", no pasara nada.
 */
export const imprimirEtiquetas = (etiquetas: EtiquetaSerial[]): void => {
  if (etiquetas.length === 0) return;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.inset = "auto -1px -1px auto";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  document.body.appendChild(iframe);

  const quitar = () => {
    if (iframe.parentNode) iframe.remove();
  };

  const doc = iframe.contentDocument;
  if (!doc) {
    quitar();
    return;
  }
  doc.open();
  doc.write(htmlDeDocumento(etiquetas));
  doc.close();

  const ventana = iframe.contentWindow;
  // El iframe queda en el DOM hasta que termine de imprimir: quitarlo antes puede cancelar el
  // impreso en algunos navegadores (sobre todo en el celular, donde imprimir no bloquea).
  // "afterprint" avisa cuando terminó; por si el navegador no lo dispara, hay un respaldo.
  ventana?.addEventListener("afterprint", quitar);
  setTimeout(quitar, 60_000);

  ventana?.focus();
  ventana?.print();
};
