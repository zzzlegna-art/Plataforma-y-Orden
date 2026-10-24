import { describe, expect, it } from "vitest";

import { parseProductCsvFeatures } from "./product-csv-features";

describe("parseProductCsvFeatures", () => {
  const fields = [
    { key: "ram" as const, label: "Memoria RAM" },
    { key: "storage" as const, label: "Almacenamiento" },
  ];
  const ids = () => {
    let next = 0;
    return () => `test-${++next}`;
  };

  it("mapea las características conocidas por etiqueta o clave y conserva campos personalizados", () => {
    expect(
      parseProductCsvFeatures(
        "Memoria RAM: 8 GB | storage: 256 GB | Color especial: Azul noche",
        fields,
        ids(),
      ),
    ).toEqual({
      ram: "8 GB",
      storage: "256 GB",
      customFields: [{ id: "test-1", name: "Color especial", value: "Azul noche" }],
    });
  });

  it("conserva las características como campos personalizados si falta la categoría", () => {
    expect(parseProductCsvFeatures("RAM: 8 GB | Almacenamiento: 256 GB", [], ids())).toEqual({
      customFields: [
        { id: "test-1", name: "RAM", value: "8 GB" },
        { id: "test-2", name: "Almacenamiento", value: "256 GB" },
      ],
    });
  });

  it("compara etiquetas sin distinguir mayúsculas ni tildes", () => {
    expect(parseProductCsvFeatures("memoria ram: 12 GB", fields, ids())).toEqual({ ram: "12 GB" });
  });

  it("conserva los dos puntos dentro del valor", () => {
    expect(parseProductCsvFeatures("Conector: USB-C: carga rápida", [], ids())).toEqual({
      customFields: [{ id: "test-1", name: "Conector", value: "USB-C: carga rápida" }],
    });
  });

  it("devuelve undefined para celdas vacías o sin pares etiqueta-valor", () => {
    expect(parseProductCsvFeatures("   ", fields, ids())).toBeUndefined();
    expect(parseProductCsvFeatures("sin formato | : sin etiqueta", fields, ids())).toBeUndefined();
  });
});
