import { describe, expect, it } from "vitest";

import { coincideBusquedaInventario, normalizarBusquedaInventario } from "./inventory-search";

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

  it("no filtra cuando la consulta está vacía y no coincide con valores ausentes", () => {
    expect(coincideBusquedaInventario("  ", fields)).toBe(true);
    expect(coincideBusquedaInventario("marca inexistente", [undefined, null, ""])).toBe(false);
  });
});
