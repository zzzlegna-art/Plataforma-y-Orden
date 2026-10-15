import { describe, expect, it } from "vitest";

import { errorDeImei, errorDeSerialCelular, esCodigoInterno, generarCodigoInterno } from "./imei";

describe("esCodigoInterno", () => {
  it("un código con muchos ceros al inicio es interno", () => {
    expect(esCodigoInterno("000000000000123")).toBe(true);
    expect(esCodigoInterno("00000000" + "9876543")).toBe(true);
  });
  it("un IMEI real (sin ceros al inicio) no es un código interno", () => {
    expect(esCodigoInterno("354198263141008")).toBe(false);
  });
  it("demasiado largo (más de 16 dígitos), no cuenta como código interno", () => {
    expect(esCodigoInterno("00000000" + "1".repeat(20))).toBe(false);
  });
});

describe("errorDeSerialCelular", () => {
  it("acepta un código interno, aunque no pase el dígito de control de un IMEI real", () => {
    expect(errorDeSerialCelular("000000009876543")).toBeNull();
  });
  it("un IMEI real sigue validándose igual que antes (con dígito de control)", () => {
    // Mismo comportamiento que errorDeImei para todo lo que NO es un código interno.
    const imei = "354198263141008";
    expect(errorDeSerialCelular(imei)).toBe(errorDeImei(imei));
  });
  it("algo que no es ni un IMEI válido ni un código interno, se rechaza", () => {
    expect(errorDeSerialCelular("abc")).not.toBeNull();
  });
});

describe("generarCodigoInterno", () => {
  it("genera un código interno válido (pasa esCodigoInterno)", () => {
    const codigo = generarCodigoInterno(() => false);
    expect(esCodigoInterno(codigo)).toBe(true);
  });
  it("no repite un código que ya está en uso", () => {
    const yaUsados = new Set(["000000001111111"]);
    const codigo = generarCodigoInterno((serial) => yaUsados.has(serial));
    expect(yaUsados.has(codigo)).toBe(false);
  });
});
