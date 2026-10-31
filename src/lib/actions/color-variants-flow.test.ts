import { describe, expect, it } from "vitest";
import { emptyDb, DomainError } from "../db";
import type { Actor, Db } from "../types";
import { createProduct, updateProduct } from "./catalogs";
import { addReceptionItem, confirmReception, createReception } from "./receptions";
import { asignarColorUnit } from "./units";
import { cambiarColorReferenciaPedido, createOrder, serializarImeiPedido, confirmarPreparacionPedido, confirmarVentaPedido } from "./orders";

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
  it("cambia el color y el precio de 28 IMEI sin borrar sus asignaciones", () => {
    const { db, product } = setup();
    for (let i = 0; i < 28; i += 1) {
      db.units.push({
        id: `unit-color-${i}`, productId: product.id,
        serial: `IMEI123456789${String(i).padStart(2, "0")}`,
        status: "en_bodega", condition: "nuevo", cost: 3900000,
        color: "Blanco", receivedAt: "2026-01-01", createdBy: actor.id,
      });
    }
    const order = createOrder(db, actor, {
      customerId: "cliente",
      lineas: [{ productId: product.id, quantity: 28, condition: "nuevo", color: "Blanco" }],
    });
    const item = db.orderItems[0];
    db.units.forEach((unit) => serializarImeiPedido(db, actor, {
      orderId: order.id, imei: unit.serial, orderItemId: item.id,
    }));
    const serialesAntes = db.units.map((u) => u.serial);
    const asignacionesAntes = db.orderItemUnits.map((r) => ({ ...r }));
    expect(item.unitPrice).toBe(4300000);

    cambiarColorReferenciaPedido(db, actor, { orderItemId: item.id, color: "Azul" });
    expect(item.color).toBe("Azul");
    expect(item.unitPrice).toBe(4150000);
    expect(item.subtotal).toBe(28 * 4150000);
    expect(db.orders[0].total).toBe(28 * 4150000);
    expect(db.units.map((u) => u.serial)).toEqual(serialesAntes);
    expect(db.orderItemUnits).toEqual(asignacionesAntes);
    expect(db.units.every((u) => u.color === "Azul")).toBe(true);
    expect(db.units.every((u) => u.cost === 3900000)).toBe(true);

    confirmarPreparacionPedido(db, actor, { orderId: order.id });
    cambiarColorReferenciaPedido(db, actor, { orderItemId: item.id, color: "Borgoña" });
    expect(item.color).toBe("Borgoña");
    expect(item.unitPrice).toBe(4200000);
    expect(db.orders[0].total).toBe(28 * 4200000);
    expect(db.orderItemUnits).toEqual(asignacionesAntes);
    confirmarVentaPedido(db, actor, { orderId: order.id });
    expect(db.orders[0].status).toBe("despachado");
    expect(() => cambiarColorReferenciaPedido(db, actor, {
      orderItemId: item.id, color: "Blanco",
    })).toThrow(DomainError);
    expect(db.units.every((u) => u.color === "Borgoña" && u.status === "vendido")).toBe(true);
  });

  it("no permite mezclar dos líneas del mismo producto y color", () => {
    const { db, product } = setup();
    const order = createOrder(db, actor, {
      customerId: "cliente",
      lineas: [
        { productId: product.id, quantity: 2, condition: "nuevo", color: "Blanco" },
        { productId: product.id, quantity: 3, condition: "nuevo", color: "Azul" },
      ],
    });
    const item = db.orderItems[1];
    expect(() => cambiarColorReferenciaPedido(db, actor, {
      orderItemId: item.id, color: "Blanco",
    })).toThrow(DomainError);
    expect(item.color).toBe("Azul");
    expect(order.total).toBe(2 * 4300000 + 3 * 4150000);
  });

  it("recibe sin color y solicita la elección solamente al serializar el pedido", () => {
    const { db, product } = setup();
    const reception = createReception(db, actor, {});
    addReceptionItem(db, actor, {
      receptionId: reception.id, productId: product.id, serial: "NO-COLOR-111", condition: "nuevo",
    });
    addReceptionItem(db, actor, {
      receptionId: reception.id, productId: product.id, serial: "NO-COLOR-222", condition: "nuevo",
    });
    confirmReception(db, actor, { id: reception.id });

    expect(db.units).toHaveLength(2);
    expect(db.units.every((unit) => !unit.color)).toBe(true);
    expect(db.products).toHaveLength(1);

    const pedido = createOrder(db, actor, {
      customerId: "cliente",
      lineas: [{ productId: product.id, condition: "nuevo", quantity: 2 }],
    });
    const item = db.orderItems[0];
    expect(item.color).toBeUndefined();
    expect(() => serializarImeiPedido(db, actor, {
      orderId: pedido.id, imei: "NO-COLOR-111", orderItemId: item.id,
    })).toThrow(DomainError);
    expect(db.orderItemUnits).toHaveLength(0);

    cambiarColorReferenciaPedido(db, actor, { orderItemId: item.id, color: "Blanco" });
    expect(item.unitPrice).toBe(4300000);
    serializarImeiPedido(db, actor, { orderId: pedido.id, imei: "NO-COLOR-111", orderItemId: item.id });
    serializarImeiPedido(db, actor, { orderId: pedido.id, imei: "NO-COLOR-222", orderItemId: item.id });
    expect(db.units.map((unit) => unit.color)).toEqual(["Blanco", "Blanco"]);
    expect(db.units.map((unit) => unit.cost)).toEqual([3800000, 3800000]);
    confirmarPreparacionPedido(db, actor, { orderId: pedido.id });
    confirmarVentaPedido(db, actor, { orderId: pedido.id });
    expect(db.orders[0].total).toBe(8600000);
    expect(db.units.every((unit) => unit.status === "vendido")).toBe(true);
  });

  it("no cambia el costo real de recepción al seleccionar el color después", () => {
    const { db, product } = setup();
    const reception = createReception(db, actor, {});
    addReceptionItem(db, actor, {
      receptionId: reception.id, productId: product.id, serial: "COST-EXPLICIT-111",
      condition: "nuevo", cost: 3900000,
    });
    confirmReception(db, actor, { id: reception.id });
    const order = createOrder(db, actor, {customerId:"cliente",lineas:[
      {productId:product.id, quantity:1,condition:"nuevo",color:"Azul"},
    ]});
    serializarImeiPedido(db, actor, { orderId: order.id, imei:"COST-EXPLICIT-111", orderItemId:db.orderItems[0].id });
    expect(db.units[0].color).toBe("Azul");
    expect(db.units[0].cost).toBe(3900000);
    confirmarPreparacionPedido(db, actor, { orderId:order.id });
    confirmarVentaPedido(db, actor, { orderId:order.id });
    expect(db.orders[0].status).toBe("despachado");
  });

  it("asigna al color de la línea escaneada, no al primer color del mismo modelo", () => {
    const { db, product } = setup();
    const reception = createReception(db, actor, {});
    addReceptionItem(db, actor, {
      receptionId:reception.id, productId:product.id, serial:"UNSORTED-A",condition:"nuevo",
    });
    addReceptionItem(db, actor, {
      receptionId:reception.id, productId:product.id, serial:"UNSORTED-B",condition:"nuevo",
    });
    confirmReception(db, actor, {id:reception.id});
    const order = createOrder(db, actor, {customerId:"cliente",lineas:[
      {productId:product.id, quantity:1, condition:"nuevo", color:"Blanco"},
      {productId:product.id, quantity:1, condition:"nuevo", color:"Azul"},
    ]});
    const [blanco, azul] = db.orderItems;
    serializarImeiPedido(db, actor, {orderId:order.id,imei:"UNSORTED-A",orderItemId:azul.id});
    serializarImeiPedido(db, actor, {orderId:order.id,imei:"UNSORTED-B",orderItemId:blanco.id});
    expect(db.units[0].color).toBe("Azul");
    expect(db.units[1].color).toBe("Blanco");
    expect(db.orderItemUnits.find((a) => a.unitId === db.units[0].id)?.orderItemId).toBe(azul.id);
    expect(db.orderItemUnits.find((a) => a.unitId === db.units[1].id)?.orderItemId).toBe(blanco.id);
  });

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
