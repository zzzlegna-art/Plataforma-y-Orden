// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { conTransicionCircular } from "./circular-transition";

afterEach(() => {
  vi.restoreAllMocks();
  delete (document as { startViewTransition?: unknown }).startViewTransition;
});

describe("conTransicionCircular", () => {
  it("sin ningún origen (ref todavía no montada), ejecuta el cambio directo", () => {
    const cambiar = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    conTransicionCircular(null, cambiar);
    expect(cambiar).toHaveBeenCalledTimes(1);
  });

  it("con movimiento reducido preferido, ejecuta el cambio directo (sin animar)", () => {
    const cambiar = vi.fn();
    const boton = document.createElement("button");
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    const inicioTransicion = vi.fn();
    (document as unknown as { startViewTransition: typeof inicioTransicion }).startViewTransition = inicioTransicion;

    conTransicionCircular(boton, cambiar);

    expect(cambiar).toHaveBeenCalledTimes(1);
    expect(inicioTransicion).not.toHaveBeenCalled(); // ni se intenta animar
  });

  it("sin soporte de View Transitions en el navegador, ejecuta el cambio directo", () => {
    const cambiar = vi.fn();
    const boton = document.createElement("button");
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    // No se define document.startViewTransition: simula un navegador que no lo soporta.
    conTransicionCircular(boton, cambiar);
    expect(cambiar).toHaveBeenCalledTimes(1);
  });

  it("con soporte y sin movimiento reducido, anima: el cambio ocurre dentro de startViewTransition", () => {
    const cambiar = vi.fn();
    const boton = document.createElement("button");
    document.body.appendChild(boton);
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;

    let callbackCapturado: (() => void) | null = null;
    const inicioTransicion = vi.fn((cb: () => void) => {
      callbackCapturado = cb;
      return { ready: Promise.resolve() };
    });
    (document as unknown as { startViewTransition: typeof inicioTransicion }).startViewTransition = inicioTransicion;
    document.documentElement.animate = vi.fn();

    conTransicionCircular(boton, cambiar);

    expect(inicioTransicion).toHaveBeenCalledTimes(1);
    expect(cambiar).not.toHaveBeenCalled(); // no se llama directo...
    callbackCapturado?.(); // ...sino dentro del callback de la transición
    expect(cambiar).toHaveBeenCalledTimes(1);

    document.body.removeChild(boton);
  });
});
