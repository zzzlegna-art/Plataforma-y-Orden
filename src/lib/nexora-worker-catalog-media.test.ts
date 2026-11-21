import { describe, expect, it } from "vitest";
import { catalogCoverPhoto, parseCatalogMedia } from "./nexora-worker-catalog-media";
import { parseReferenceStock } from "./nexora-reference-stock";
import { parseImeiDirectory } from "./nexora-imei-directory";

const counters = {
  total: 41, physicallyVerified: 31, committedOrders: 0,
  unverified: 0, inTransit: 0, pendingReturn: 0, sold: 10,
};

describe("Inventario operativo de Bodega 6A", () => {
  it("muestra la fotografía real antes que las fotos de variantes y descarta importes antiguos", () => {
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

  it("consolida existencias por referencia sin desglose por sedes ni importes", () => {
    const result = parseReferenceStock({
      scope: "serialized_imei_only", initialApproved: true,
      page: 1, pageSize: 20, matched: 1,
      items: [{
        productId: "i13", name: "iPhone 13 Pro 256 GB", sku: "IP13P-256",
        categoryKey: "celular", imageUrl: "https://example.test/iphone13.png",
        colorVariants: [], ...counters,
        cost: 1500000, sites: [{ siteName: "Sede antigua" }],
      }],
    });
    expect(result.matched).toBe(1);
    expect(result.items[0].total).toBe(41);
    expect(result.items[0].sold).toBe(10);
    expect(result.items[0]).not.toHaveProperty("cost");
    expect(result.items[0]).not.toHaveProperty("sites");
    expect(result.items[0].imageUrl).toBe("https://example.test/iphone13.png");
  });

  it("en el directorio IMEI conserva identificación y fotografía, no costos", () => {
    const parsed = parseImeiDirectory({
      initialApproved: true, page: 1, pageSize: 25, matched: 1,
      summary: { sinConciliar: 0, enSede: 1, vendidos: 0, total: 1 },
      items: [{
        unitId: "unit-1", serial: "123456789012345",
        productName: "iPhone 13 Pro", sku: "IP13P-256",
        categoryKey: "celular", imageUrl: "https://example.test/phone.png",
        colorVariants: [], unitStatus: "en_bodega",
        custodyState: "en_sede", historicalLocation: null,
        committedOrder: false, cost: 1500000,
      }],
    });
    expect(parsed.items[0].serial).toBe("123456789012345");
    expect("cost" in parsed.items[0]).toBe(false);
    expect(catalogCoverPhoto(parsed.items[0])).toBe("https://example.test/phone.png");
  });

  it("lee especificaciones técnicas explícitas sin inventar información", () => {
    const details = {
      storage: "128 GB", ram: "4 GB", processor: "Apple A13 Bionic",
      rearCamera: "Sistema dual de 12 MP", frontCamera: "12 MP TrueDepth",
      connectivity: "4G LTE, WI-FI 6, Bluetooth 5.0",
      compatibility: "Dual SIM: nano-SIM + eSIM",
    };
    const media = parseCatalogMedia({
      categoryKey: "celular",
      imageUrl: "https://example.test/iphone11.png",
      technicalSpecs: { ...details, secret: "no se debe mostrar" },
      description: "Descripción de catálogo.",
    });
    expect(media.technicalSpecs).toEqual(details);
    expect(Object.keys(media.technicalSpecs ?? {})).toHaveLength(7);
    expect(media.description).toBe("Descripción de catálogo.");
    expect("secret" in (media.technicalSpecs ?? {})).toBe(false);
  });

  it("no fabrica especificaciones vacías ni acepta datos técnicos corruptos", () => {
    expect(parseCatalogMedia({ technicalSpecs: null }).technicalSpecs).toBeNull();
    expect(parseCatalogMedia({ technicalSpecs: {} }).technicalSpecs).toBeNull();
    expect(() => parseCatalogMedia({ technicalSpecs: { ram: 4 } })).toThrow(/especificaciones/i);
    expect(() => parseCatalogMedia({ technicalSpecs: [] })).toThrow(/especificaciones/i);
  });
});
