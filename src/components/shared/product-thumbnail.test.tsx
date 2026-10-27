// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { getProductReferenceImageFallback, ProductThumbnail } from "./product-thumbnail";

afterEach(cleanup);

describe("ProductThumbnail", () => {
  it("no muestra nada cuando la referencia no tiene fotografía", () => {
    const { container } = render(<ProductThumbnail alt="iPhone" />);
    expect(container.firstChild).toBeNull();
  });

  it("encuentra fotos de referencia para modelos conocidos sin imagen propia", () => {
    expect(getProductReferenceImageFallback("Apple iPhone 16 Pro Max 256 GB")).toContain(
      "iphone-16-pro-max-naturaltitanium-select",
    );
    expect(getProductReferenceImageFallback("iPhone 16 Pro 128 GB")).toContain(
      "iphone-16-pro-deserttitanium-select",
    );
    expect(getProductReferenceImageFallback("Apple iPhone 13 Pro Max 256 GB")).toContain(
      "iphone-13-pro-max-gold-select",
    );
    expect(getProductReferenceImageFallback("Samsung Galaxy A55")).toBeUndefined();
  });

  it("muestra la foto de referencia cuando no hay una imagen guardada", () => {
    render(<ProductThumbnail alt="iPhone 16 Pro Max 256 GB" />);
    expect(screen.getByRole("img", { name: "iPhone 16 Pro Max 256 GB" }).getAttribute("src")).toContain(
      "iphone-16-pro-max-naturaltitanium-select",
    );
  });

  it("muestra la foto de iPhone 13 Pro Max cuando el catálogo no tiene imagen", () => {
    render(<ProductThumbnail alt="Apple iPhone 13 Pro Max 256 GB" />);
    expect(screen.getByRole("img", { name: "Apple iPhone 13 Pro Max 256 GB" }).getAttribute("src")).toContain(
      "iphone-13-pro-max-gold-select",
    );
  });

  it("no inventa imagen para el display Sunlong iPhone 13 Pro Max sin foto subida", () => {
    const display = "Display Sunlong iPhone 13 Pro Max";
    expect(getProductReferenceImageFallback(display)).toBeUndefined();
    const { container } = render(<ProductThumbnail alt={display} />);
    expect(screen.queryByRole("img", { name: display })).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it.each([
    "Pantalla iPhone 13 Pro Max",
    "Batería iPhone 13 Pro Max",
    "Flex de carga iPhone 16 Pro",
    "Cámara iPhone 16 Pro Max",
    "Display Sunlong iPhone 13 Pro Max 256 GB",
    "iPhone 13 Pro Max pantalla Sunlong",
  ])("no asocia fotos de teléfonos completos a repuestos: %s", (name) => {
    expect(getProductReferenceImageFallback(name)).toBeUndefined();
  });

  it("una imagen explícitamente subida tiene prioridad incluso si es un repuesto", () => {
    const display = "Display Sunlong iPhone 13 Pro Max";
    render(<ProductThumbnail src="https://example.com/display-sunlong.png" alt={display} />);
    expect(screen.getByRole("img", { name: display }).getAttribute("src"))
      .toBe("https://example.com/display-sunlong.png");
  });

  it("muestra la fotografía con texto alternativo", () => {
    render(<ProductThumbnail src="https://example.com/iphone.png" alt="iPhone 13" size="md" />);
    expect(screen.getByRole("img", { name: "iPhone 13" }).getAttribute("src")).toBe(
      "https://example.com/iphone.png",
    );
  });

  it("permite una miniatura ampliada para la captura de recepción", () => {
    render(<ProductThumbnail src="https://example.com/iphone.png" alt="iPhone 13" size="xl" />);
    expect(screen.getByRole("img", { name: "iPhone 13" }).className).toContain("h-20");
    expect(screen.getByRole("img", { name: "iPhone 13" }).className).toContain("w-20");
  });

  it("permite una imagen de referencia grande para la ficha del serial", () => {
    render(<ProductThumbnail src="https://example.com/iphone.png" alt="iPhone 13" size="2xl" />);
    expect(screen.getByRole("img", { name: "iPhone 13" }).className).toContain("h-28");
    expect(screen.getByRole("img", { name: "iPhone 13" }).className).toContain("w-28");
  });

  it("oculta la fotografía si la URL no carga", () => {
    render(<ProductThumbnail src="https://example.com/missing.png" alt="iPhone 13" />);
    fireEvent.error(screen.getByRole("img", { name: "iPhone 13" }));
    expect(screen.queryByRole("img", { name: "iPhone 13" })).toBeNull();
  });
});
