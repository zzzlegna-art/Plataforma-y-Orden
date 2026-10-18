// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductThumbnail } from "./product-thumbnail";

describe("ProductThumbnail", () => {
  it("no muestra nada cuando la referencia no tiene fotografía", () => {
    const { container } = render(<ProductThumbnail alt="iPhone" />);
    expect(container.firstChild).toBeNull();
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

  it("oculta la fotografía si la URL no carga", () => {
    render(<ProductThumbnail src="https://example.com/missing.png" alt="iPhone 13" />);
    fireEvent.error(screen.getByRole("img", { name: "iPhone 13" }));
    expect(screen.queryByRole("img", { name: "iPhone 13" })).toBeNull();
  });
});
