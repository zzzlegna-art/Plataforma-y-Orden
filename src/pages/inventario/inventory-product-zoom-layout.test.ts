import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/pages/inventario/inventory-product-zoom.css", "utf8");
const editor = readFileSync("src/pages/inventario/product-editor-premium.css", "utf8");

describe("Visores premium · protección de distribución", () => {
  it("el recuadro limita la foto vertical y nunca la recorta", () => {
    const frame = css.match(/\.nx-inventory-zoom-stage\s*\{([^}]+)\}/)?.[1] ?? "";
    const img = css.match(/\.nx-inventory-zoom-stage img\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(frame).toContain("position: relative");
    expect(frame).toContain("min-height: 0");
    expect(img).toContain("position: absolute");
    expect(img).toContain("object-fit: contain");
    expect(img).not.toContain("object-fit: cover");
  });

  it("el visor mantiene separación para colores y desplazamiento en móviles", () => {
    expect(css).toContain(".nx-inventory-zoom-colors");
    expect(css).toContain("@media (max-width: 690px)");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("hsl(var(--card))");
    expect(css).toContain("hsl(var(--primary)");
  });

  it("Editar producto mantiene contenido desplazable y pie visible", () => {
    const scroll = editor.match(/\.nx-product-editor \.nx-editor-scroll\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(scroll).toContain("overflow-y:scroll");
    expect(editor).toContain(".nx-editor-footer");
    expect(editor).toContain(".nx-editor-variant-photo-field");
  });
});
