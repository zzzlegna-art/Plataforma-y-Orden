import { describe, expect, it } from "vitest";

import { coincideBusquedaInventario, indexUnitSerialsByProduct, normalizarBusquedaInventario } from "./inventory-search";

describe("búsqueda premium del inventario", () => {
  const fields = [
    "iPhone 16 Pro",
    "APL-16P",
    "Apple",
    "Celulares",
    "Equipo móvil de alta resolución",
    "Titanio",
  ];

  it("busca por nombre y referencia", () => {
    expect(coincideBusquedaInventario("iphone 16", fields)).toBe(true);
    expect(coincideBusquedaInventario("apl-16p", fields)).toBe(true);
  });

  it("busca por marca, categoría, descripción y características", () => {
    expect(coincideBusquedaInventario("apple", fields)).toBe(true);
    expect(coincideBusquedaInventario("celulares", fields)).toBe(true);
    expect(coincideBusquedaInventario("alta resolución", fields)).toBe(true);
    expect(coincideBusquedaInventario("titanio", fields)).toBe(true);
  });

  it("ignora mayúsculas y tildes", () => {
    expect(normalizarBusquedaInventario("  AUDÍFONOS   inalámbricos ")).toBe("audifonos inalambricos");
    expect(coincideBusquedaInventario("resolucion", fields)).toBe(true);
  });

  it("permite que los términos coincidan entre campos distintos", () => {
    expect(coincideBusquedaInventario("Apple iPhone", fields)).toBe(true);
    expect(coincideBusquedaInventario("Apple reloj", fields)).toBe(false);
  });

  it("indexa seriales por producto sin repetir recorridos y permite buscar por serial parcial", () => {
    const index = indexUnitSerialsByProduct([
      { productId: "p1", serial: "  SN-24A9-77B1 " },
      { productId: "p1", serial: "IMEI-867530912345678" },
      { productId: "p2", serial: "SN-OTHER" },
      { productId: "p2", serial: "   " },
    ]);

    expect(index.get("p1")).toEqual(["SN-24A9-77B1", "IMEI-867530912345678"]);
    expect(index.get("p2")).toEqual(["SN-OTHER"]);
    expect(coincideBusquedaInventario("24A9", index.get("p1"))).toBe(true);
    expect(coincideBusquedaInventario("8675309", index.get("p1"))).toBe(true);
    expect(coincideBusquedaInventario("24A9", index.get("p2"))).toBe(false);
  });

  it("no filtra cuando la consulta está vacía y no coincide con valores ausentes", () => {
    expect(coincideBusquedaInventario("  ", fields)).toBe(true);
    expect(coincideBusquedaInventario("marca inexistente", [undefined, null, ""])).toBe(false);
  });
});
