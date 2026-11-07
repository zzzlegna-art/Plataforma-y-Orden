import { describe, expect, it } from "vitest";
import type { WarrantyView } from "./selectors";
import {
  ordenarReferenciasGarantia,
  ordenarVistasGarantiaPorReferencia,
} from "./warranty-sorting";

const vista = (referencia: string, code: string, receivedAt: string) =>
  ({
    product: referencia ? { name: referencia } : undefined,
    warranty: { referenciaManual: referencia, code, receivedAt },
  }) as unknown as WarrantyView;

describe("orden de referencias en garantías", () => {
  it("ordena modelos numéricos de mayor a menor", () => {
    expect(ordenarReferenciasGarantia([
      "iPhone 13 128 GB",
      "iPhone 15 128 GB",
      "iPhone 11 128 GB",
      "iPhone 14 128 GB",
    ])).toEqual([
      "iPhone 15 128 GB",
      "iPhone 14 128 GB",
      "iPhone 13 128 GB",
      "iPhone 11 128 GB",
    ]);
  });

  it("deja las referencias vacías al final y ordena también modelos con sufijos", () => {
    expect(ordenarReferenciasGarantia([
      "",
      "iPhone 15 Pro",
      "iPhone 15 Pro Max",
      "iPhone 14 Pro Max",
    ])).toEqual([
      "iPhone 15 Pro Max",
      "iPhone 15 Pro",
      "iPhone 14 Pro Max",
      "",
    ]);
  });

  it("ordena los casos por modelo y mantiene los más recientes primero dentro del mismo modelo", () => {
    const ordenadas = ordenarVistasGarantiaPorReferencia([
      vista("iPhone 13 128 GB", "GAR-13", "2026-11-01T10:00:00Z"),
      vista("iPhone 15 128 GB", "GAR-15-1", "2026-11-01T10:00:00Z"),
      vista("iPhone 15 128 GB", "GAR-15-2", "2026-11-06T10:00:00Z"),
      vista("iPhone 11 128 GB", "GAR-11", "2026-11-01T10:00:00Z"),
    ]);

    expect(ordenadas.map((item) => item.warranty.code)).toEqual([
      "GAR-15-2",
      "GAR-15-1",
      "GAR-13",
      "GAR-11",
    ]);
  });
});
