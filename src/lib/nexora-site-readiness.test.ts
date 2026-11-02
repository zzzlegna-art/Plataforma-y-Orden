import { describe, expect, it } from "vitest";
import { parseReadiness, parseProductReadiness } from "./nexora-site-readiness";

describe("Nexora Multisede · disponibilidad segura por sede", () => {
  it("muestra cero disponibilidad antes de la aprobación física", () => {
    expect(parseReadiness({
      approved: false, sites: [], inTransit: 0, returnPending: 0, unmapped: 0,
    })).toEqual({
      approved: false, sites: [], inTransit: 0, returnPending: 0, unmapped: 0,
    });
  });

  it("separa IMEI sin reserva, comprometidos, restringidos y devueltos", () => {
    const report = parseReadiness({
      approved: true, inTransit: 3, returnPending: 5, unmapped: 7,
      sites: [{ siteId: "s1", siteName: "Principal", siteType: "principal",
        physical: 20, candidate: 12, reserved: 5, restricted: 3 }],
    });
    expect(report.sites[0]).toMatchObject({
      physical: 20, candidate: 12, reserved: 5, restricted: 3,
    });
    expect(report.returnPending).toBe(5);
    expect(report.inTransit).toBe(3);
    expect(report.sites[0].candidate).toBe(12);
  });

  it("conserva nombres y ordena referencias naturalmente por modelo", () => {
    const products = parseProductReadiness([
      { productId: "p17", productName: "iPhone 17", candidate: 5, reserved: 0, restricted: 0 },
      { productId: "p13", productName: "iPhone 13", candidate: 3, reserved: 2, restricted: 0 },
      { productId: "p16", productName: "iPhone 16", candidate: 1, reserved: 0, restricted: 0 },
    ]);
    expect(products.map((p) => p.productName)).toEqual(["iPhone 13","iPhone 16","iPhone 17"]);
  });

  it("no convierte valores corruptos en cantidades de inventario", () => {
    expect(() => parseReadiness(null)).toThrow();
    expect(() => parseReadiness({ approved: true, sites: [], inTransit: -1, returnPending: 0, unmapped: 0 })).toThrow();
    expect(() => parseReadiness({
      approved: true, sites: [{ siteId: "A", siteName: "X", siteType: "local", physical: 1,
        candidate: "1", reserved: 0, restricted: 0 }],
      inTransit: 0, returnPending: 0, unmapped: 0,
    })).toThrow();
    expect(() => parseProductReadiness([{productId: "p",productName:"iPhone",candidate:1.5,
      reserved:0,restricted:0}])).toThrow();
  });
});
