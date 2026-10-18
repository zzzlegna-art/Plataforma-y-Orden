import { describe, expect, it } from "vitest";

import { DomainError, emptyDb } from "../db";
import type { Actor, Db } from "../types";
import { createProduct, createProductType, deleteProductType, generarSkuProducto, updateProduct, updateProductType } from "./catalogs";

const admin: Actor = { id: "u1", email: "a@x.com", fullName: "Admin", role: "admin" };
const bodeguero: Actor = { id: "u2", email: "b@x.com", fullName: "Bodeguero", role: "bodeguero" };
const now = new Date().toISOString();

const conLosCincoDeSiempre = (): Db => {
  const db = emptyDb();
  const base = { createdAt: now };
  db.productTypes = [
    { id: "t1", key: "celular", name: "Celulares", mayoristaGroup: "celulares", ...base },
    { id: "t2", key: "tablet", name: "Tablets", mayoristaGroup: "celulares", ...base },
    { id: "t3", key: "reloj", name: "Relojes", mayoristaGroup: "celulares", ...base },
    { id: "t4", key: "audifono", name: "Audífonos", mayoristaGroup: "celulares", ...base },
    { id: "t5", key: "repuesto", name: "Repuestos", mayoristaGroup: "repuestos", ...base },
  ];
  return db;
};

describe("createProductType", () => {
  it("solo un administrador puede crear un tipo nuevo", () => {
    const db = conLosCincoDeSiempre();
    expect(() => createProductType(db, bodeguero, { name: "Parlantes", mayoristaGroup: "celulares" })).toThrow(
      DomainError,
    );
  });

  it("crea el tipo con una key propia, derivada del nombre", () => {
    const db = conLosCincoDeSiempre();
    const tipo = createProductType(db, admin, { name: "Parlantes Bluetooth", mayoristaGroup: "celulares" });
    expect(tipo.key).toBe("parlantes-bluetooth");
    expect(db.productTypes).toContainEqual(tipo);
  });

  it("dos nombres iguales (sin importar mayúsculas/tildes) no se dejan crear dos veces", () => {
    const db = conLosCincoDeSiempre();
    createProductType(db, admin, { name: "Parlantes", mayoristaGroup: "celulares" });
    expect(() => createProductType(db, admin, { name: "PARLANTES", mayoristaGroup: "repuestos" })).toThrow(
      DomainError,
    );
  });

  it('dos nombres que generan la misma key ("Parlante!" y "Parlante?") no chocan: la segunda se numera', () => {
    const db = conLosCincoDeSiempre();
    const uno = createProductType(db, admin, { name: "Parlante!", mayoristaGroup: "celulares" });
    const dos = createProductType(db, admin, { name: "Parlante?", mayoristaGroup: "celulares" });
    expect(uno.key).toBe("parlante");
    expect(dos.key).toBe("parlante-2");
  });

  it("sin nombre, no se deja crear", () => {
    const db = conLosCincoDeSiempre();
    expect(() => createProductType(db, admin, { name: "  ", mayoristaGroup: "celulares" })).toThrow(DomainError);
  });
});

describe("updateProductType", () => {
  it("renombra el tipo pero la key (lo que ya está guardado en los productos) no cambia", () => {
    const db = conLosCincoDeSiempre();
    const tipo = createProductType(db, admin, { name: "Parlantes", mayoristaGroup: "celulares" });
    const actualizado = updateProductType(db, admin, {
      id: tipo.id,
      name: "Parlantes Bluetooth",
      mayoristaGroup: "repuestos",
    });
    expect(actualizado.name).toBe("Parlantes Bluetooth");
    expect(actualizado.key).toBe(tipo.key); // no cambió
    expect(actualizado.mayoristaGroup).toBe("repuestos");
  });

  it("solo un administrador puede editar", () => {
    const db = conLosCincoDeSiempre();
    const tipo = createProductType(db, admin, { name: "Parlantes", mayoristaGroup: "celulares" });
    expect(() =>
      updateProductType(db, bodeguero, { id: tipo.id, name: "X", mayoristaGroup: "celulares" }),
    ).toThrow(DomainError);
  });
});

describe("deleteProductType", () => {
  it("ninguno de los 5 tipos de siempre se puede eliminar", () => {
    const db = conLosCincoDeSiempre();
    for (const tipo of db.productTypes) {
      expect(() => deleteProductType(db, admin, { id: tipo.id })).toThrow(DomainError);
    }
  });

  it("un tipo nuevo sin productos sí se puede eliminar", () => {
    const db = conLosCincoDeSiempre();
    const tipo = createProductType(db, admin, { name: "Parlantes", mayoristaGroup: "celulares" });
    deleteProductType(db, admin, { id: tipo.id });
    expect(db.productTypes.find((t) => t.id === tipo.id)).toBeUndefined();
  });

  it("un tipo nuevo con productos asociados no se puede eliminar", () => {
    const db = conLosCincoDeSiempre();
    const tipo = createProductType(db, admin, { name: "Parlantes", mayoristaGroup: "celulares" });
    db.products.push({
      id: "p1", sku: "S1", name: "Parlante JBL", categoria: tipo.key,
      price: 1, cost: 1, minStock: 0, isActive: true, createdAt: now, updatedAt: now,
    });
    expect(() => deleteProductType(db, admin, { id: tipo.id })).toThrow(DomainError);
  });
});

describe("SKU corta automática", () => {
  it("abrevia modelos comunes y conserva la capacidad", () => {
    const db = emptyDb();
    expect(generarSkuProducto(db, "iPhone 13 128 GB")).toBe("IP13-128");
    expect(generarSkuProducto(db, "Apple iPhone 14 Pro Max 256 GB")).toBe("IP14PM-256");
    expect(generarSkuProducto(db, "Samsung Galaxy S24 Ultra 256 GB")).toBe("S24U-256");
    expect(generarSkuProducto(db, "Samsung Galaxy A55 128GB")).toBe("A55-128");
  });

  it("mantiene el código corto y agrega sufijo si ya existe", () => {
    const db = emptyDb();
    db.products.push({
      id: "p1", sku: "IP13-128", name: "iPhone 13 128 GB",
      price: 1, cost: 1, minStock: 0, isActive: true, createdAt: now, updatedAt: now,
    });
    expect(generarSkuProducto(db, "iPhone 13 128 GB")).toBe("IP13-128-2");
  });

  it("al crear un producto genera SKU si se deja vacía", () => {
    const db = emptyDb();
    const created = createProduct(db, admin, {
      name: "iPhone 13 128 GB", price: 1, cost: 1, minStock: 0,
    });
    expect(created.sku).toBe("IP13-128");
  });

  it("guarda y permite quitar la foto sin alterar los datos de inventario", () => {
    const db = emptyDb();
    const created = createProduct(db, admin, {
      name: "iPhone 13 128 GB",
      price: 1,
      cost: 0.5,
      minStock: 2,
      imageUrl: "https://example.supabase.co/storage/v1/object/public/product-images/products/a.jpg",
    });
    expect(created.imageUrl).toContain("/product-images/");

    const updated = updateProduct(db, admin, {
      id: created.id,
      name: created.name,
      price: created.price,
      cost: created.cost,
      minStock: created.minStock,
      imageUrl: null,
    });
    expect(updated.imageUrl).toBeUndefined();
    expect(updated.minStock).toBe(2);
  });

  it("guarda solo las características que corresponden al tipo de equipo", () => {
    const db = emptyDb();
    const phone = createProduct(db, admin, {
      name: "iPhone 13 128 GB", categoria: "celular", price: 1, cost: 1, minStock: 0,
      technicalSpecs: {
        storage: " 128 GB ", ram: "4 GB", waterResistance: "dato que no corresponde a celular",
      },
    });
    expect(phone.technicalSpecs).toEqual({ storage: "128 GB", ram: "4 GB" });

    const watch = updateProduct(db, admin, {
      id: phone.id, name: phone.name, categoria: "reloj", price: phone.price, cost: phone.cost,
      minStock: phone.minStock, technicalSpecs: { caseSize: "45 mm", storage: "dato que no corresponde a reloj" },
    });
    expect(watch.technicalSpecs).toEqual({ caseSize: "45 mm" });

    const sparePart = createProduct(db, admin, {
      name: "Display iPhone 13", categoria: "repuesto", price: 1, cost: 1, minStock: 0,
      technicalSpecs: { storage: "no debe guardarse" },
    });
    expect(sparePart.technicalSpecs).toBeUndefined();
  });
});
