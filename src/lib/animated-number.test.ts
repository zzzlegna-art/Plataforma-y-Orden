import { describe, expect, it } from "vitest";

import { easeOutCubic, valorIntermedio } from "./animated-number";

describe("easeOutCubic", () => {
  it("empieza en 0 y termina en 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });
  it("a mitad de camino ya recorrió más de la mitad (arranca rápido, frena al final)", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
  it("es creciente", () => {
    expect(easeOutCubic(0.7)).toBeGreaterThan(easeOutCubic(0.3));
  });
});

describe("valorIntermedio", () => {
  it("antes de empezar da el valor de partida; al terminar, el valor final", () => {
    expect(valorIntermedio(0, 100, 0, 500)).toBe(0);
    expect(valorIntermedio(0, 100, 500, 500)).toBe(100);
  });
  it("pasado el tiempo, se queda en el valor final (no se pasa ni oscila)", () => {
    expect(valorIntermedio(0, 100, 10_000, 500)).toBe(100);
  });
  it("a mitad de camino el valor va entre los dos extremos", () => {
    const v = valorIntermedio(0, 100, 250, 500);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(100);
  });
  it("funciona igual si el número baja en vez de subir", () => {
    const v = valorIntermedio(100, 20, 250, 500);
    expect(v).toBeLessThan(100);
    expect(v).toBeGreaterThan(20);
  });
  it("con duración 0 salta directo al valor final", () => {
    expect(valorIntermedio(0, 100, 0, 0)).toBe(100);
  });
  it("es monótono: nunca retrocede mientras avanza el tiempo", () => {
    const pasos = [0, 50, 100, 150, 200, 300, 400, 500].map((t) => valorIntermedio(0, 100, t, 500));
    for (let i = 1; i < pasos.length; i++) expect(pasos[i]).toBeGreaterThanOrEqual(pasos[i - 1]);
  });
});
