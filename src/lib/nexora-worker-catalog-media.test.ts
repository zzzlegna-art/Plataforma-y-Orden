import { describe, expect, it } from "vitest";
import {
  catalogCoverPhoto, commercialSiteGroups, parseCatalogMedia,
} from "./nexora-worker-catalog-media";
import { parseReferenceStock } from "./nexora-reference-stock";
import { parseImeiDirectory } from "./nexora-imei-directory";

const counters = {
  total: 41,
  physicallyVerified: 31,
  available: 0,
  unverified: 0,
  inTransit: 0,
  pendingReturn: 0,
  sold: 10,
};

describe("Inventario comercial de Encargado/Vendedor", () => {
  it("muestra la fotografía real antes que las fotos de variantes", () => {
    const media = parseCatalogMedia({
      categoryKey: "celular",
      imageUrl: "https://example.test/iphone-principal.png",
      colorVariants: [{
        color: "Azul", imageUrl: "https://example.test/iphone-azul.png",
        swatchHex: "#0000ff", price: 9999, cost: 500,
      }],
    });
    expect(catalogCoverPhoto(media)).toBe("https://example.test/iphone-principal.png");
    expect(media.colorVariants[0]).toEqual({
      color: "Azul",
      imageUrl: "https://example.test/iphone-azul.png",
      swatchHex: "#0000ff",
    });
    expect("price" in media.colorVariants[0]).toBe(false);
    expect("cost" in media.colorVariants[0]).toBe(false);
  });

  it("usa primera foto registrada del color si falta la principal", () => {
    const media = parseCatalogMedia({
      imageUrl: null, categoryKey: "celular",
      colorVariants: [{ color: "Negro", imageUrl: "https://example.test/negro.png" }],
    });
    expect(catalogCoverPhoto(media)).toBe("https://example.test/negro.png");
  });

  it("no inventa una foto ni acepta datos de variantes corruptos", () => {
    expect(catalogCoverPhoto(parseCatalogMedia({}))).toBeUndefined();
    expect(() => parseCatalogMedia({ colorVariants: { color: "Azul" } })).toThrow();
  });

  it("IP13P-256: una referencia para 31 en Bodega 6A y 10 vendidos históricos", () => {
    const result = parseReferenceStock({
      scope: "serialized_imei_only", initialApproved: true,
      page: 1, pageSize: 20, matched: 1,
      items: [{
        productId: "i13", name: "iphone 13 Pro 256 GB", sku: "IP13P-256",
        categoryKey: "celular",
        imageUrl: "https://example.test/iphone13.png",
        colorVariants: [],
        ...counters,
        sites: [
          {
            siteId: "bodega-6a", siteName: "Bodega 6A", cityName: "Barranquilla",
            total: 31, physicallyVerified: 31, available: 0,
            unverified: 0, inTransit: 0, pendingReturn: 0, sold: 0,
          },
          {
            siteId: null, siteName: "Sin sede verificada", cityName: null,
            total: 10, physicallyVerified: 0, available: 0,
            unverified: 0, inTransit: 0, pendingReturn: 0, sold: 10,
          },
        ],
      }],
    });
    expect(result.matched).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].sold).toBe(10);
    expect(result.items[0].total).toBe(41);
    expect(commercialSiteGroups(result.items[0].sites)).toHaveLength(1);
    expect(commercialSiteGroups(result.items[0].sites)[0].siteName).toBe("Bodega 6A");
    expect(result.items[0].imageUrl).toBe("https://example.test/iphone13.png");
  });

  it("en IMEI conserva costo real y fotografía de la referencia", () => {
    const parsed = parseImeiDirectory({
      initialApproved: true, page: 1, pageSize: 25, matched: 1,
      sites: [], summary: {
        sinConciliar: 0, enSede: 1, enTransito: 0,
        retornoPendiente: 0, vendidos: 0, sinCosto: 0, total: 1,
      },
      items: [{
        unitId: "unit-1", serial: "123456789012345",
        productName: "iPhone 13 Pro", sku: "IP13P-256",
        categoryKey: "celular", imageUrl: "https://example.test/phone.png",
        colorVariants: [], cost: 1500000, unitStatus: "en_bodega",
        custodyState: "en_sede", siteId: "bodega-6a",
        siteName: "Bodega 6A", cityName: "Barranquilla",
        historicalLocation: null, committedOrder: false,
        committedTransfer: false, commercialCandidate: true,
      }],
    });
    expect(parsed.items[0].cost).toBe(1500000);
    expect(catalogCoverPhoto(parsed.items[0])).toBe("https://example.test/phone.png");
  });

  it("tolera el contrato RPC anterior sin imagen mientras se publica la migración", () => {
    expect(parseCatalogMedia({})).toEqual({
      imageUrl: null, categoryKey: null, colorVariants: [],
    });
  });
});
