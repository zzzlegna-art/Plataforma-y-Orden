import { describe, expect, it } from "vitest";
import { parseReferenceStock } from "./nexora-reference-stock";

const result = (overrides: Record<string, unknown> = {}) => parseReferenceStock({
  initialApproved: true,
  scope: "serialized_imei_only",
  page: 1,
  pageSize: 20,
  matched: 1,
  items: [{
    productId: "p1", name: "iPhone 13 Pro 256 GB", sku: "IP13P-256",
    categoryKey: "celular", imageUrl: "https://example.test/ip13.png",
    colorVariants: [], technicalSpecs: { storage: "256 GB" },
    total: 41, physicallyVerified: 31, committedOrders: 5, unverified: 0, sold: 10,
    ...overrides,
  }],
});

describe("Inventario por referencia en Bodega 6A", () => {
  it("consolida seriales verificados, comprometidos, pendientes y salidas históricas", () => {
    const parsed = result();
    expect(parsed.items[0]).toMatchObject({
      sku: "IP13P-256", total: 41, physicallyVerified: 31,
      committedOrders: 5, unverified: 0, sold: 10,
    expect(parsed.items[0]).not.toHaveProperty("sites");
    expect(parsed.items[0]).not.toHaveProperty("available");
    expect(parsed.items[0]).not.toHaveProperty("salePrice");
    expect(parsed.items[0]).not.toHaveProperty("referenceCost");
    expect(parsed.items[0]).not.toHaveProperty("inTransit");
    expect(parsed.items[0]).not.toHaveProperty("pendingReturn");
    });
  });

  it("rechaza asignaciones a pedidos superiores a las unidades verificadas", () => {
    expect(() => result({ committedOrders: 32 })).toThrow(/inconsistentes/);
  });

  it("rechaza totales que no cuadran con el inventario serializado", () => {
    expect(() => result({ total: 42 })).toThrow(/inconsistentes/);
  });
});
