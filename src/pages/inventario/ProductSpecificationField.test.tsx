// @vitest-environment jsdom
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ProductSpecificationField, PRODUCT_TECHNICAL_TEXT_LIMIT } from "./ProductSpecificationField";

const ControlledSpecification = ({ multiline = false }: { multiline?: boolean }) => {
  const [value, setValue] = useState("");
  return (
    <ProductSpecificationField
      id="watch-connectivity"
      value={value}
      onValueChange={setValue}
      multiline={multiline}
      placeholder="Conectividad"
    />
  );
};

describe("edición de características técnicas en inventario", () => {
  it("permite pulsar espacio sin eliminarlo al final de la palabra", async () => {
    const user = userEvent.setup();
    render(<ControlledSpecification />);
    const input = screen.getByRole("textbox");

    await user.type(input, "Bluetooth ");
    expect((input as HTMLInputElement).value).toBe("Bluetooth ");
    await user.type(input, "5.3 y Wi-Fi");
    expect((input as HTMLInputElement).value).toBe("Bluetooth 5.3 y Wi-Fi");
  });

  it("respeta espacios múltiples y separadores mientras se sigue escribiendo", () => {
    render(<ControlledSpecification multiline />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Apple Watch  Series 11 - 46 mm " } });
    expect((input as HTMLTextAreaElement).value).toBe("Apple Watch  Series 11 - 46 mm ");
  });

  it("permite especificaciones extensas de reloj, más allá del antiguo límite de 120", () => {
    render(<ControlledSpecification multiline />);
    const input = screen.getByRole("textbox");
    expect(input.getAttribute("maxLength")).toBe(String(PRODUCT_TECHNICAL_TEXT_LIMIT));
    const detail = "Sensores: frecuencia cardíaca, oxígeno en sangre, ECG y temperatura. " +
      "Compatibilidad con iPhone 11 o posterior y watchOS; Bluetooth y GPS según variante.";
    expect(detail.length).toBeGreaterThan(120);
    fireEvent.change(input, { target: { value: detail } });
    expect((input as HTMLTextAreaElement).value).toBe(detail);
  });
});
