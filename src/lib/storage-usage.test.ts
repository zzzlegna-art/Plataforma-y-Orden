import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));

import { DomainError } from "@/lib/db";
import {
  LIMITE_ARCHIVOS_BYTES,
  LIMITE_BASE_DATOS_BYTES,
  formatBytes,
  nivelDeUso,
  obtenerUsoAlmacenamiento,
} from "./storage-usage";

beforeEach(() => mocks.rpc.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("nivelDeUso", () => {
  it("por debajo del 70%: ok", () => {
    expect(nivelDeUso(50, 100)).toBe("ok");
    expect(nivelDeUso(69, 100)).toBe("ok");
  });
  it("entre 70% y 90%: aviso", () => {
    expect(nivelDeUso(70, 100)).toBe("aviso");
    expect(nivelDeUso(89, 100)).toBe("aviso");
  });
  it("90% o más: crítico", () => {
    expect(nivelDeUso(90, 100)).toBe("critico");
    expect(nivelDeUso(150, 100)).toBe("critico"); // pasado del límite, sigue crítico
  });
  it("límite en 0 no revienta (no divide entre cero)", () => {
    expect(nivelDeUso(10, 0)).toBe("ok");
  });
});

describe("formatBytes", () => {
  it("elige la unidad según el tamaño", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 ** 2)).toBe("5.0 MB");
    expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.50 GB");
  });
});

describe("obtenerUsoAlmacenamiento", () => {
  it("lee los tres valores de la función del servidor", async () => {
    mocks.rpc.mockResolvedValue({
      data: { documentos_bytes: 4278126, documentos_count: 2, base_datos_bytes: 17312915 },
      error: null,
    });
    const uso = await obtenerUsoAlmacenamiento();
    expect(mocks.rpc).toHaveBeenCalledWith("nexora_uso_almacenamiento");
    expect(uso).toEqual({ documentosBytes: 4278126, documentosCount: 2, baseDatosBytes: 17312915 });
  });

  it("si falla la consulta, lanza un error de dominio", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "x" } });
    await expect(obtenerUsoAlmacenamiento()).rejects.toBeInstanceOf(DomainError);
  });
});

describe("límites del plan gratuito", () => {
  it("son los que documenta Supabase: 1 GB de archivos, 500 MB de base de datos", () => {
    expect(LIMITE_ARCHIVOS_BYTES).toBe(1024 ** 3);
    expect(LIMITE_BASE_DATOS_BYTES).toBe(500 * 1024 ** 2);
  });
});
