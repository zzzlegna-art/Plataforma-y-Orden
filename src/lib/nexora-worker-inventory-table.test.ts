import { describe, expect, it } from "vitest";
import { parseReferenceStock } from "./nexora-reference-stock";

const baseCounts = {
  total: 41, physicallyVerified: 31, available: 0,
  unverified: 0, inTransit: 0, pendingReturn: 0, sold: 10,
};

describe("Inventario de locales · misma tabla del inventario principal", () => {
  it("expone foto real, marca, precio y condición sin alterar el stock verificable", () => {
    const result = parseReferenceStock({
      initialApproved: true, scope: "serialized_imei_only",
      page: 1, pageSize: 20, matched: 1,
      items: [{
        productId: "ip13p", name: "iPhone 13 Pro 256 GB", sku: "IP13P-256",
        imageUrl: "https://example.test/referencias/ip13p.png",
        colorVariants: [], categoryKey: "celular",
        brandName: "Apple", salePrice: 1280000, referenceCost: 920000,
        newUnits: 0, usedUnits: 31, ...baseCounts,
        sites: [
          { siteId: "bodega-6a", siteName: "Bodega 6A", cityName: "Barranquilla",
            total: 31, physicallyVerified: 31, available: 0,
            unverified: 0, inTransit: 0, pendingReturn: 0, sold: 0 },
          { siteId: null, siteName: "Sin sede verificada", cityName: null,
            total: 10, physicallyVerified: 0, available: 0,
            unverified: 0, inTransit: 0, pendingReturn: 0, sold: 10 },
        ],
      }],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      sku: "IP13P-256", brandName: "Apple",
      salePrice: 1280000, referenceCost: 920000,
      newUnits: 0, usedUnits: 31,
      physicallyVerified: 31, sold: 10, available: 0, total: 41,
    });
  });

  it("rechaza cantidades por condición superiores a las existencias verificadas", () => {
    expect(() => parseReferenceStock({
      initialApproved: true, scope: "serialized_imei_only",
      page: 1, pageSize: 20, matched: 1,
      items: [{
        productId: "p", name: "Phone", sku: "PHONE", ...baseCounts,
        newUnits: 32, usedUnits: 0, sites: [{
          siteId: "bodega-6a", siteName: "Bodega 6A", cityName: "Barranquilla",
          ...{ ...baseCounts, total: 31, sold: 0 },
        }, {
          siteId: null, siteName: "Sin sede verificada", cityName: null,
          ...{ ...baseCounts, total: 10, physicallyVerified: 0, sold: 10 },
        }],
      }],
    })).toThrow(/condición supera/);
  });

  it("es compatible con el contrato anterior sin campos de tabla nuevos", () => {
    const result = parseReferenceStock({
      initialApproved: true, scope: "serialized_imei_only",
      page: 1, pageSize: 20, matched: 1,
      items: [{
        productId: "new", name: "Sin equipo", sku: "NEW",
        total: 0, physicallyVerified: 0, available: 0, unverified: 0,
        inTransit: 0, pendingReturn: 0, sold: 0, sites: [],
      }],
    });
    expect(result.items[0]).toMatchObject({
      brandName: null, salePrice: null, referenceCost: null,
      newUnits: 0, usedUnits: 0,
    });
  });
});
