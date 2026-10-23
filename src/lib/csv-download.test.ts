// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { descargarCsv } from "./csv";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("descargarCsv", () => {
  it("descarga un archivo CSV y libera su URL temporal", () => {
    vi.useFakeTimers();
    const blobs: Blob[] = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: (blob: Blob) => {
        blobs.push(blob);
        return "blob:catalogo-csv-test";
      },
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revoke,
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    try {
      descargarCsv("catalogo-nexora.csv", [["Producto"], ["iPhone 16"]]);

      expect(blobs).toHaveLength(1);
      expect(blobs[0].type).toBe("text/csv;charset=utf-8;");
      expect(click).toHaveBeenCalledOnce();
      expect(document.querySelector('a[download="catalogo-nexora.csv"]')).toBeNull();

      vi.advanceTimersByTime(1000);
      expect(revoke).toHaveBeenCalledWith("blob:catalogo-csv-test");
    } finally {
      if (originalCreate) {
        Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreate });
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
      if (originalRevoke) {
        Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevoke });
      } else {
        Reflect.deleteProperty(URL, "revokeObjectURL");
      }
    }
  });
});
