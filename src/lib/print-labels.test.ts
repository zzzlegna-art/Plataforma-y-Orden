// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { generarSvgCodigoBarras, imprimirEtiquetas, tamanoNombre } from "./print-labels";

beforeAll(() => {
  // jsdom no implementa <canvas>; jsbarcode lo usa solo para medir el ancho del texto (incluso
  // en modo SVG). Con measureText devolviendo 0 basta: jsbarcode ya sabe manejarlo.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    font: "",
    measureText: () => ({ width: 0 }),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.querySelectorAll("iframe").forEach((el) => el.remove());
  vi.useRealTimers();
});

describe("generarSvgCodigoBarras", () => {
  it("genera un SVG con el código de barras del serial", () => {
    const svg = generarSvgCodigoBarras("359175923749557");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("un valor que JsBarcode no puede codificar da una cadena vacía, sin lanzar error", () => {
    // CODE128 no acepta una cadena vacía como valor.
    expect(generarSvgCodigoBarras("")).toBe("");
  });

  it("no dibuja el número dentro del código de barras (queda solo en el <div class=\"serial\">, para que no salga dos veces)", () => {
    const svg = generarSvgCodigoBarras("359175923749557");
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("359175923749557"); // ni como texto dentro del SVG
  });
});

// Nota: jsdom no implementa window.print() (solo avisa "Not implemented" y no hace nada), y no
// hay forma confiable de interceptar esa llamada dentro del iframe recién creado para
// comprobar que se invocó. Lo que sí se puede probar con certeza aquí es lo importante del
// arreglo: que ya NO depende de window.open (por eso no pasaba nada con el bloqueador de
// ventanas emergentes), que el contenido queda bien armado, y que el iframe se limpia solo.
describe("tamanoNombre", () => {
  it("un nombre corto se ve más grande que uno largo", () => {
    expect(tamanoNombre("iPad")).toBeGreaterThan(tamanoNombre("Apple iPhone 13 Pro Max 256 GB"));
  });
  it("es decreciente (nunca un nombre más largo queda con letra más grande)", () => {
    const nombres = ["iPad", "Apple iPhone 13", "Apple iPhone 13 128 GB", "Apple iPhone 13 Pro Max 256 GB Azul"];
    const tamanos = nombres.map(tamanoNombre);
    for (let i = 1; i < tamanos.length; i++) expect(tamanos[i]).toBeLessThanOrEqual(tamanos[i - 1]);
  });
});

describe("imprimirEtiquetas", () => {
  const iframeImpreso = () => document.querySelector("iframe")!;

  it("no usa window.open: nunca depende de que el navegador permita ventanas emergentes", () => {
    const abrir = vi.spyOn(window, "open");
    imprimirEtiquetas([{ producto: "X", serial: "1" }]);
    expect(abrir).not.toHaveBeenCalled();
  });

  it("no hace nada si la lista viene vacía (no deja ningún iframe)", () => {
    imprimirEtiquetas([]);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("agrega un iframe oculto con una etiqueta por serial", () => {
    imprimirEtiquetas([
      { producto: "Apple iPhone 12 - 128 GB", serial: "359175923749557" },
      { producto: "Apple iPhone 12 - 128 GB", serial: "354791666675724" },
    ]);

    const iframe = iframeImpreso();
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute("aria-hidden")).toBe("true"); // no estorba ni se lee en voz alta

    const html = iframe.contentDocument!.body.innerHTML;
    expect(html).toContain("359175923749557");
    expect(html).toContain("354791666675724");
    expect((html.match(/class="etiqueta"/g) ?? []).length).toBe(2);
    expect(html).toContain("<svg");
  });

  it("el tamaño de página coincide con el rollo térmico de la bodega (56 x 40 mm)", () => {
    imprimirEtiquetas([{ producto: "X", serial: "1" }]);
    const html = iframeImpreso().contentDocument!.documentElement.innerHTML;
    expect(html).toContain("@page { size: 56mm 40mm; margin: 0; }");
  });

  it("cada etiqueta tiene el marco, la línea separadora y la marca 6A", () => {
    imprimirEtiquetas([{ producto: "Apple iPhone 13 128 GB", serial: "352408237401079" }]);
    const html = iframeImpreso().contentDocument!.body.innerHTML;
    expect(html).toContain('class="marco"');
    expect(html).toContain('class="linea"');
    expect(html).toContain('class="marca"');
    expect(html).toContain(">6A<");
  });

  it("deja espacio reservado abajo para la marca, para que un serial largo (IMEI de 15 dígitos) no la monte encima", () => {
    imprimirEtiquetas([{ producto: "X", serial: "1" }]);
    const html = iframeImpreso().contentDocument!.documentElement.innerHTML;
    expect(html).toContain("padding: 1.5mm 1.5mm 8mm");
  });

  it("el nombre del producto lleva el tamaño de letra calculado para su largo", () => {
    imprimirEtiquetas([{ producto: "Apple iPhone 13 128 GB", serial: "1" }]);
    const html = iframeImpreso().contentDocument!.body.innerHTML;
    expect(html).toContain(`font-size:${tamanoNombre("Apple iPhone 13 128 GB")}px`);
  });

  it("solo la última etiqueta no fuerza salto de página (para no dejar una hoja en blanco extra)", () => {
    imprimirEtiquetas([
      { producto: "A", serial: "1" },
      { producto: "B", serial: "2" },
    ]);
    const html = iframeImpreso().contentDocument!.documentElement.innerHTML;
    expect(html).toContain(".etiqueta:last-child { page-break-after: auto; break-after: auto; }");
  });

  it("escapa el nombre del producto (evita romper el HTML o inyectar código)", () => {
    imprimirEtiquetas([{ producto: `iPhone <script>alert("x")</script> & "raro"`, serial: "1" }]);
    const html = iframeImpreso().contentDocument!.body.innerHTML;
    // Lo que importa: el <script> quedó como texto inerte, no como una etiqueta real (si no se
    // hubiera escapado, no aparecería literalmente "&lt;script&gt;" sino un <script> de verdad).
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    // Las comillas dentro de texto no hace falta escaparlas como &quot; (solo en atributos);
    // el texto decodificado debe seguir ahí tal cual.
    expect(iframeImpreso().contentDocument!.body.textContent).toContain('"raro"');
  });

  it("quita el iframe de la página cuando termina de imprimir (evento «afterprint»)", () => {
    imprimirEtiquetas([{ producto: "X", serial: "1" }]);
    const iframe = iframeImpreso();
    expect(document.body.contains(iframe)).toBe(true);

    iframe.contentWindow!.dispatchEvent(new Event("afterprint"));

    expect(document.body.contains(iframe)).toBe(false);
  });

  it("si «afterprint» nunca llega (pasa en algunos navegadores), lo quita igual pasado un rato", () => {
    vi.useFakeTimers();
    imprimirEtiquetas([{ producto: "X", serial: "1" }]);
    const iframe = iframeImpreso();

    vi.advanceTimersByTime(60_000);

    expect(document.body.contains(iframe)).toBe(false);
  });

  it("dos impresiones seguidas no se pisan: cada una tiene su propio iframe con su contenido", () => {
    imprimirEtiquetas([{ producto: "Primero", serial: "111" }]);
    const primero = iframeImpreso();
    imprimirEtiquetas([{ producto: "Segundo", serial: "222" }]);
    const iframes = document.querySelectorAll("iframe");

    expect(iframes.length).toBe(2);
    expect(primero.contentDocument!.body.innerHTML).toContain("111");
    expect(iframes[1].contentDocument!.body.innerHTML).toContain("222");
  });
});
