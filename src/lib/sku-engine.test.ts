import { describe, expect, it } from "vitest";

import { skuBaseReferencia } from "./sku-engine";

describe("SKU escalables para Nexora", () => {
  it("diferencia JK, Sunlong y otras variantes de display aunque compartan iPhone", () => {
    expect(skuBaseReferencia({ name: "Display JK iPhone 13 Pro Max", categoria: "repuesto" }))
      .toBe("PAN-JK-IP13PM");
    expect(skuBaseReferencia({ name: "Display Sunlong iPhone 13 Pro Max", categoria: "repuesto" }))
      .toBe("PAN-SUN-IP13PM");
    expect(skuBaseReferencia({ name: "Display Sunlong iPhone 16 Pro Max", categoria: "repuesto" }))
      .toBe("PAN-SUN-IP16PM");
    expect(skuBaseReferencia({ name: "Dispay JK iPhone 12 Pro Max", categoria: "repuesto" }))
      .toBe("PAN-JK-IP12PM");
    expect(skuBaseReferencia({ name: "Pantalla OLED iPhone 13 Pro Max", categoria: "repuesto" }))
      .toBe("PAN-IP13PM-OLED");
    expect(skuBaseReferencia({ name: "Display iPhone 13", categoria: "repuesto", marca: "Sunlong" }))
      .toBe("PAN-SUN-IP13");
    expect(skuBaseReferencia({ name: "Display ZYTech iPhone 13 Pro Max", categoria: "repuesto" }))
      .toBe("PAN-ZYTEC-IP13PM");
  });

  it("conserva información crítica sobre batería, flex y modelo", () => {
    expect(skuBaseReferencia({ name: "Batería de iPhone 12/12 Pro Con Flex", categoria: "repuesto" }))
      .toBe("BAT-IP12-12P-CF");
    expect(skuBaseReferencia({ name: "Batería iPhone 13 Pro Max Flex", categoria: "repuesto" }))
      .toBe("BAT-IP13PM-CF");
    expect(skuBaseReferencia({ name: "Batería iPhone 13 Pro Max Sin Flex", categoria: "repuesto" }))
      .toBe("BAT-IP13PM-SF");
    expect(skuBaseReferencia({ name: "Batería iPhone XR Con Flex", categoria: "repuesto" }))
      .toBe("BAT-IPXR-CF");
    expect(skuBaseReferencia({ name: "Bateria iPhone 8G Con Flex", categoria: "repuesto" }))
      .toBe("BAT-IP8-CF");
  });

  it("preserva referencias conocidas y diferencia tamaños de reloj", () => {
    expect(skuBaseReferencia({ name: "iPhone 16 Pro Max 256 GB", categoria: "celular" }))
      .toBe("IP16PM-256");
    expect(skuBaseReferencia({ name: "Samsung Galaxy S25 Ultra 256 GB", categoria: "celular" }))
      .toBe("S25U-256");
    expect(skuBaseReferencia({ name: "iPad A16 128 GB", categoria: "tablet" }))
      .toBe("A16-128");
    expect(skuBaseReferencia({ name: "Airpods 4", categoria: "audifono" }))
      .toBe("AI4");
    expect(skuBaseReferencia({ name: "Watch Serie 11 - 42", categoria: "reloj" }))
      .toBe("WASE11-42");
    expect(skuBaseReferencia({ name: "Watch Serie 11 - 46", categoria: "reloj" }))
      .toBe("WASE11-46");
  });

  it("genera códigos distinguibles para consolas, videojuegos y categorías futuras", () => {
    expect(skuBaseReferencia({ name: "PlayStation 5 Slim 1 TB", categoria: "consola" }))
      .toBe("CONS-PS5-SL-1T");
    expect(skuBaseReferencia({ name: "PlayStation 5 Pro 2 TB", categoria: "consola" }))
      .toBe("CONS-PS5-PRO-2T");
    expect(skuBaseReferencia({ name: "PlayStation 5 Digital 1 TB", categoria: "consola" }))
      .toBe("CONS-PS5-DIG-1T");
    expect(skuBaseReferencia({ name: "Juego PS5 Spider Man 2", categoria: "videojuego" }))
      .toBe("JUE-PS5-SPIDERMAN-2");
    expect(skuBaseReferencia({ name: "Juego PS5 God of War Ragnarok", categoria: "videojuego" }))
      .not.toBe(skuBaseReferencia({ name: "Juego PS5 Spider Man 2", categoria: "videojuego" }));
    expect(skuBaseReferencia({ name: "Parlante JBL Go 4", categoria: "parlante" }))
      .toMatch(/^PARLANTE-/);
    expect(skuBaseReferencia({ name: "Parlante JBL Go 4", categoria: "parlante" }))
      .not.toBe(skuBaseReferencia({ name: "Parlante JBL Go 5", categoria: "parlante" }));
    expect(skuBaseReferencia({ name: "Juego PS5 God of War Ragnarok", categoria: "videojuego" }))
      .not.toBe(skuBaseReferencia({ name: "Juego PS5 God of War Valhalla", categoria: "videojuego" }));
    expect(skuBaseReferencia({ name: "Mouse Logitech G502", categoria: "periferico" }))
      .toMatch(/^PERIFERICO-/);
  });

  it("no produce identificadores vacíos o más largos que el límite reservado", () => {
    expect(skuBaseReferencia({ name: "  ", categoria: "repuesto" })).toBe("");
    const sku = skuBaseReferencia({
      name: "Control inalámbrico profesional universal para consolas PlayStation 5 edición especial",
      categoria: "accesorio",
      marca: "Marca super extensa",
    });
    expect(sku.length).toBeLessThanOrEqual(35);
    expect(sku).toMatch(/^ACC-/);
  });
});

describe("Pantallas multimodelo del catálogo", () => {
  it.each([
  [
    "Pantalla Samsung A02S / A03S / A03S / A04E",
    "PAN-SAM-A02S"
  ],
  [
    "Pantalla Samsung A13 4G",
    "PAN-SAM-A13-4G"
  ],
  [
    "Pantalla Samsung A02 / A12 / A32 5G",
    "PAN-SAM-A02"
  ],
  [
    "Pantalla Samsung A21S",
    "PAN-SAM-A21S"
  ],
  [
    "Pantalla Samsung A10 SM",
    "PAN-SAM-A10-SM"
  ],
  [
    "Pantalla Samsung A10S SM",
    "PAN-SAM-A10S-SM"
  ],
  [
    "Pantalla Samsung A51",
    "PAN-SAM-A51"
  ],
  [
    "Pantalla Samsung A31",
    "PAN-SAM-A31"
  ],
  [
    "Pantalla Moto G04 / G24",
    "PAN-MOT-G04"
  ],
  [
    "Pantalla Moto G20",
    "PAN-MOT-G20"
  ],
  [
    "Pantalla Xiaomi Note 8",
    "PAN-XIA-N8"
  ],
  [
    "Pantalla Xiaomi Note 10 / 10S 4G",
    "PAN-XIA-N10-4G"
  ],
  [
    "Pantalla Xiaomi Note 11 4G",
    "PAN-XIA-N11-4G"
  ],
  [
    "Pantalla Xiaomi Note 12 4G",
    "PAN-XIA-N12-4G"
  ],
  [
    "Pantalla Xiaomi Redmi 9A / 9C / 10A",
    "PAN-XIA-R9A"
  ],
  [
    "Pantalla Xiaomi Redmi A1 / A2",
    "PAN-XIA-A1"
  ],
  [
    "Pantalla Xiaomi Redmi 9T",
    "PAN-XIA-R9T"
  ],
  [
    "Pantalla Xiaomi Redmi 10",
    "PAN-XIA-R10"
  ],
  [
    "Pantalla Xiaomi Redmi 12",
    "PAN-XIA-R12"
  ],
  [
    "Pantalla iPhone 11 GX",
    "PAN-APP-11-GX"
  ],
  [
    "Pantalla iPhone XR GX",
    "PAN-APP-XR-GX"
  ],
  [
    "Pantalla Tecno Spark Go 2023",
    "PAN-TEC-SG2023"
  ],
  [
    "Pantalla Tecno Spark Go 2024",
    "PAN-TEC-SG2024"
  ],
  [
    "Pantalla Vivo Y33/Y33S/Y51/Y53S",
    "PAN-VIV-Y33"
  ],
  [
    "Pantalla Vivo Y20S/Y11/Y01",
    "PAN-VIV-Y20S"
  ],
  [
    "Pantalla Huawei Y9 Prime 2019",
    "PAN-HUA-Y9P2019"
  ]
])("genera %s con SKU %s", (name, expected) => {
    expect(skuBaseReferencia({ name, categoria: "repuesto" })).toBe(expected);
  });
  it("distingue tecnología y marco sin inferirlos de otras compatibilidades", () => {
    expect(skuBaseReferencia({ name: "Pantalla Samsung A51 AMOLED con marco", categoria: "repuesto" })).toBe("PAN-SAM-A51-AMOLED-CONMARCO");
    expect(skuBaseReferencia({ name: "Pantalla Samsung A02 / A32 5G", categoria: "repuesto" })).toBe("PAN-SAM-A02");
    expect(skuBaseReferencia({ name: "Batería Samsung A51", categoria: "repuesto" })).toMatch(/^BAT-/);
  });
});
