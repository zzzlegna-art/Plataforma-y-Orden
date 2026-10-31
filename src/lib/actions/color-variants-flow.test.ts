import { describe, expect, it } from "vitest";
import { emptyDb, DomainError } from "../db";
import type { Actor, Db } from "../types";
import { createProduct, updateProduct } from "./catalogs";
import { addReceptionItem, confirmReception, createReception } from "./receptions";
import { asignarColorUnit } from "./units";
import { createOrder, serializarImeiPedido, confirmarPreparacionPedido, confirmarVentaPedido } from "./orders";

const actor: Actor = { id: "admin-color", email: "admin@example.test", fullName: "Admin", role: "admin" };
const costs = [
  { color: "Blanco", cost: 3800000, price: 4300000 },
  { color: "Azul", cost: 3650000, price: 4150000 },
  { color: "Borgoña", cost: 3650000, price: 4200000 },
];
const setup = () => {
  const db: Db = emptyDb();
  const product = createProduct(db, actor, {
    sku: "TEST-17PM", name: "17 Pro Max", categoria: "tablet",
    price: 4200000, cost: 3600000, minStock: 0, colorVariants: costs,
  });
  db.customers.push({
    id: "cliente", name: "Cliente Mayorista", isActive: true,
    tipo: "mayorista", categoriaMayorista: "celulares", createdAt: "2026-01-01T00:00:00Z",
  });
  return { db, product };
};

describe("Una referencia con colores y precios independientes", () => {
  it("recibe IMEI por color sin crear nuevas SKU; conserva costo del color", () => {
    const { db, product } = setup();
    const reception = createReception(db, actor, {});
    addReceptionItem(db, actor, {receptionId: reception.id, productId: product.id, serial: "TEST-WHITE-111", condition: "nuevo", color: "Blanco"});
    addReceptionItem(db, actor, {receptionId: reception.id, productId: product.id, serial: "TEST-BLUE-222", condition: "nuevo", color: "Azul"});
    confirmReception(db, actor, { id: reception.id });
    expect(db.products).toHaveLength(1);
    expect(db.units.map((u) => u.color)).toEqual(["Blanco", "Azul"]);
    expect(db.units.map((u) => u.cost)).toEqual([3800000,3650000]);
  });

  it("calcula el precio sugerido por color y rechaza seriales del color equivocado", () => {
    const { db, product } = setup();
    const reception = createReception(db, actor, {});
    addReceptionItem(db, actor, {receptionId: reception.id, productId: product.id, serial: "WHITE-123456", condition: "nuevo", color: "Blanco"});
    addReceptionItem(db, actor, {receptionId: reception.id, productId: product.id, serial: "BLUE-123456", condition: "nuevo", color: "Azul"});
    confirmReception(db, actor, { id: reception.id });

    const order = createOrder(db, actor, {customerId:"cliente",lineas:[
      {productId:product.id,quantity:1,condition:"nuevo",color:"Blanco"},
      {productId:product.id,quantity:1,condition:"nuevo",color:"Azul"},
    ]});
    expect(db.orderItems.map((i) => i.unitPrice)).toEqual([4300000,4150000]);
    expect(db.orderItems.map((i) => i.color)).toEqual(["Blanco", "Azul"]);
    serializarImeiPedido(db, actor, {orderId:order.id,imei:"BLUE-123456"});
    serializarImeiPedido(db, actor, {orderId:order.id,imei:"WHITE-123456"});
    expect(db.orderItemUnits).toHaveLength(2);
    confirmarPreparacionPedido(db, actor, {orderId:order.id});
    confirmarVentaPedido(db, actor, {orderId:order.id});
    expect(db.units.every((u) => u.status === "vendido")).toBe(true);
    expect(db.orders[0].total).toBe(8450000);
  });

  it("no acepta un IMEI azul en línea solicitada blanca", () => {
    const { db, product } = setup();
    const reception = createReception(db, actor, {});
    addReceptionItem(db, actor, {receptionId: reception.id, productId: product.id, serial: "AZUL-COLOR-123", condition: "nuevo", color: "Azul"});
    confirmReception(db, actor, {id:reception.id});
    const order = createOrder(db, actor, {customerId:"cliente",lineas:[{productId:product.id,quantity:1,condition:"nuevo",color:"Blanco"}]});
    expect(() => serializarImeiPedido(db, actor, {orderId:order.id,imei:"AZUL-COLOR-123"})).toThrow(DomainError);
    expect(db.orderItemUnits).toHaveLength(0);
  });

  it("permite clasificar IMEI antiguos sin cambiar su costo real", () => {
    const { db, product } = setup();
    db.units.push({id:"historico",productId:product.id,serial:"TEST-OLD-IMEI",condition:"nuevo",status:"en_bodega",cost:3550000,receivedAt:"2026-01-01",createdBy:actor.id});
    asignarColorUnit(db, actor, {id:"historico",color:"Borgoña"});
    expect(db.units[0].color).toBe("Borgoña");
    expect(db.units[0].cost).toBe(3550000);
  });

  it("evita eliminar un color utilizado por IMEI en inventario", () => {
    const { db, product } = setup();
    db.units.push({id:"unidad-blanca",productId:product.id,serial:"WHITE-A",condition:"nuevo",status:"en_bodega",receivedAt:"2026-01-01",createdBy:actor.id,color:"Blanco"});
    expect(() => updateProduct(db, actor, {
      id:product.id, sku:product.sku, name:product.name, categoria:product.categoria,
      price:product.price,cost:product.cost,minStock:0,colorVariants:costs.filter((v)=>v.color!=="Blanco"),
    })).toThrow(DomainError);
    expect(product.colorVariants).toHaveLength(3);
  });
});
