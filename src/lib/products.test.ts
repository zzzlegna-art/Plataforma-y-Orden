import { describe, expect, it } from "vitest";

import { emptyDb } from "./db";
import { mayoristaGroupDeProducto, tiposProductoOrdenados } from "./products";
import type { Db } from "./types";

const now = new Date().toISOString();

const conTipos = (): Db => {
  const db = emptyDb();
  db.productTypes = [
    { id: "t1", key: "celular", name: "Celulares", mayoristaGroup: "celulares", createdAt: now },
    { id: "t2", key: "repuesto", name: "Repuestos", mayoristaGroup: "repuestos", createdAt: now },
    { id: "t3", key: "parlante", name: "Parlantes", mayoristaGroup: "repuestos", createdAt: now },
  ];
  return db;
};

const producto = (categoria: string) => ({
  id: "p1", sku: "S", name: "X", categoria, price: 1, cost: 1, minStock: 0, isActive: true, createdAt: now, updatedAt: now,
});

describe("mayoristaGroupDeProducto", () => {
  it("un celular pertenece al grupo celulares", () => {
    expect(mayoristaGroupDeProducto(conTipos(), producto("celular"))).toBe("celulares");
  });

  it("un repuesto pertenece al grupo repuestos", () => {
    expect(mayoristaGroupDeProducto(conTipos(), producto("repuesto"))).toBe("repuestos");
  });

  it("un tipo nuevo usa el grupo que se le eligió al crearlo, aunque tenga condición (como celular)", () => {
    // "parlante" tiene condición (no es como repuesto), pero su grupo mayorista es "repuestos":
    // son dos cosas independientes, justo lo que se pidió.
    expect(mayoristaGroupDeProducto(conTipos(), producto("parlante"))).toBe("repuestos");
  });

  it("sin producto, no revienta: da celulares por defecto", () => {
    expect(mayoristaGroupDeProducto(conTipos(), undefined)).toBe("celulares");
  });

  it("un tipo que ya no existe (se borró) cae al comportamiento anterior según esProductoRepuesto", () => {
    expect(mayoristaGroupDeProducto(conTipos(), producto("ya-no-existe"))).toBe("celulares");
  });
});

describe("tiposProductoOrdenados", () => {
  it("los 5 tipos de siempre van primero, en su orden de siempre; los nuevos después, alfabético", () => {
    const db = conTipos();
    db.productTypes.push(
      { id: "t4", key: "zeta", name: "Zeta", mayoristaGroup: "celulares", createdAt: now },
      { id: "t5", key: "alfa", name: "Alfa", mayoristaGroup: "celulares", createdAt: now },
    );
    const keys = tiposProductoOrdenados(db).map((t) => t.key);
    expect(keys).toEqual(["celular", "repuesto", "alfa", "parlante", "zeta"]);
  });
});
