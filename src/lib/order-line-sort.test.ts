import { describe, expect, it } from "vitest";
import type { OrderLineView } from "@/lib/selectors";
import type { Product, UnitCondition } from "@/lib/types";
import { ordenarLineasPedido } from "./order-line-sort";

const line = (
  id: string,
  name: string,
  condition: UnitCondition = "nuevo",
  color?: string,
): OrderLineView => ({
  item: {
    id,
    orderId: "pedido-1",
    productId: id,
    condition,
    color,
    quantity: 1,
    unitPrice: 100,
    subtotal: 100,
  },
  product: {
    id,
    sku: `SKU-${name.toLowerCase().replace(/\\s+/g, "-")}`,
    name,
    price: 100,
    cost: 50,
    minStock: 0,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } satisfies Product,
  units: [],
  serializados: 0,
  esRepuesto: false,
});

describe("orden natural de referencias en el detalle de pedidos", () => {
  it("organiza modelos numéricos de menor a mayor aunque se agreguen desordenados", () => {
    const original = [
      line("17", "iPhone 17 Pro Max"),
      line("13", "iPhone 13"),
      line("2", "iPhone 2"),
      line("15", "iPhone 15 Pro"),
      line("14", "iPhone 14"),
    ];

    expect(ordenarLineasPedido(original).map((item) => item.product?.name)).toEqual([
      "iPhone 2",
      "iPhone 13",
      "iPhone 14",
      "iPhone 15 Pro",
      "iPhone 17 Pro Max",
    ]);
    // El orden del pedido almacenado no se modifica.
    expect(original[0].product?.name).toBe("iPhone 17 Pro Max");
  });

  it("mantiene juntas las variantes de un modelo y ordena condición y color", () => {
    const lines = [
      line("azul-semi", "iPhone 13", "seminuevo", "Azul"),
      line("negro-nuevo", "iPhone 13", "nuevo", "Negro"),
      line("azul-nuevo", "iPhone 13", "nuevo", "Azul"),
      line("17", "iPhone 17"),
    ];

    expect(ordenarLineasPedido(lines).map((item) => item.item.id)).toEqual([
      "azul-nuevo",
      "negro-nuevo",
      "azul-semi",
      "17",
    ]);
  });

  it("ordena sin distinguir mayúsculas ni acentos y deja las referencias sin nombre al final", () => {
    const lines = [
      { ...line("sin-nombre", "", "nuevo"), product: undefined },
      line("pixel", "Píxel 9"),
      line("iphone", "iPhone 13"),
    ];
    expect(ordenarLineasPedido(lines).map((item) => item.item.id)).toEqual([
      "iphone",
      "pixel",
      "sin-nombre",
    ]);
  });

  it("no pierde ni duplica referencias cuando hay nombres iguales", () => {
    const lines = [
      line("a", "iPhone 13"),
      line("b", "iPhone 13"),
      line("c", "iPhone 13"),
    ];
    expect(ordenarLineasPedido(lines).map((item) => item.item.id)).toEqual(["a", "b", "c"]);
  });
});
