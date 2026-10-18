import { describe, expect, it } from "vitest";
import { celdaCsvSegura, crearCsv } from "./csv";

describe("exportación CSV segura de Nexora", () => {
  it.each([
    ["=1+1", "\"'=1+1\""],
    ["+SUM(1)", "\"'+SUM(1)\""],
    ["-2+3", "\"'-2+3\""],
    ["@nombre", "\"'@nombre\""],
    ["  =HYPERLINK(\"https://ejemplo.com\")", "\"'  =HYPERLINK(\"\"https://ejemplo.com\"\")\""],
    ["\t=1+1", "\"'\t=1+1\""],
    ["SKU-001", "\"SKU-001\""],
    ["Celular; nuevo", "\"Celular; nuevo\""],
  ])("protege y entrecomilla %s", (entrada, esperado) => {
    expect(celdaCsvSegura(entrada)).toBe(esperado);
  });

  it("mantiene los números negativos como valores numéricos", () => {
    expect(celdaCsvSegura(-3)).toBe('"-3"');
  });

  it("conserva BOM UTF-8 y separadores de fila compatibles con Excel", () => {
    expect(crearCsv([["IMEI", "Unidades"], ["123456789012345", 2]])).toBe(
      "\uFEFF\"IMEI\";\"Unidades\"\r\n\"123456789012345\";\"2\"",
    );
  });
});
