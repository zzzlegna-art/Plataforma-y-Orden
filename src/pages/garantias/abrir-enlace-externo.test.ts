// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { abrirEnlaceExterno } from "./abrir-enlace-externo";

afterEach(() => {
  vi.restoreAllMocks();
  document.querySelectorAll("a").forEach((a) => a.remove());
});

describe("abrirEnlaceExterno", () => {
  it("no usa window.open (falla en silencio dentro de la app instalada)", () => {
    const abrir = vi.spyOn(window, "open");
    abrirEnlaceExterno("https://x/y.pdf");
    expect(abrir).not.toHaveBeenCalled();
  });

  it("crea un enlace, le hace clic, y lo apunta a la url con target _blank sin opener", () => {
    let capturado: HTMLAnchorElement | null = null;
    const clickOriginal = HTMLAnchorElement.prototype.click;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      capturado = this;
      return clickOriginal.call(this);
    });

    abrirEnlaceExterno("https://x/y.pdf?token=1");

    expect(capturado).not.toBeNull();
    expect(capturado!.href).toBe("https://x/y.pdf?token=1");
    expect(capturado!.target).toBe("_blank");
    expect(capturado!.rel).toBe("noopener noreferrer");
  });

  it("no deja el enlace pegado en la página después de usarlo", () => {
    abrirEnlaceExterno("https://x/y.pdf");
    expect(document.querySelector("a")).toBeNull();
  });
});
