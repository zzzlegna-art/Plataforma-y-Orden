import { describe, expect, it, vi } from "vitest";
import { resolveOcrCreateWorker } from "./nexora-invoice-reader";

describe("Factura de proveedor · carga del OCR en fotografías", () => {
  const worker = {
    recognize: vi.fn(async () => ({ data: { text: "FACTURA FE-123" } })),
    terminate: vi.fn(async () => undefined),
  };

  it("reconoce la exportación ESM por defecto del CDN de Tesseract.js", async () => {
    const createWorker = vi.fn(async () => worker);
    const load = resolveOcrCreateWorker({ default: { createWorker } });
    const instance = await load("spa+eng");

    expect(createWorker).toHaveBeenCalledOnce();
    expect(createWorker).toHaveBeenCalledWith("spa+eng");
    expect((await instance.recognize(new Blob(["JPEG"], { type: "image/jpeg" }))).data.text)
      .toBe("FACTURA FE-123");
    await instance.terminate();
  });

  it("admite también la exportación nombrada de createWorker", async () => {
    const createWorker = vi.fn(async () => worker);
    const load = resolveOcrCreateWorker({ createWorker });
    expect(await load("spa+eng")).toBe(worker);
    expect(createWorker).toHaveBeenCalledWith("spa+eng");
  });

  it("prefiere la exportación nombrada si ambas están presentes", async () => {
    const named = vi.fn(async () => worker);
    const fromDefault = vi.fn(async () => worker);
    await resolveOcrCreateWorker({
      createWorker: named,
      default: { createWorker: fromDefault },
    })("spa+eng");
    expect(named).toHaveBeenCalledOnce();
    expect(fromDefault).not.toHaveBeenCalled();
  });

  it.each([null, {}, { default: {} }, { createWorker: "not a function" }])(
    "informa si el módulo no ofrece la fábrica de OCR (%s)",
    (invalid) => {
      expect(() => resolveOcrCreateWorker(invalid)).toThrow(/manual/i);
    },
  );
});
