import { describe, expect, it } from "vitest";
import { emptyDb } from "./db";
import { getDashboard, getProductStock, getUnitTimeline, unidadesDescontadasPorPreparacion } from "./selectors";
import { confirmarPreparacionPedido, confirmarVentaPedido, serializarImeiPedido } from "./actions/orders";
import type { Actor, Order, OrderItem, Product, Unit } from "./types";

const actor: Actor = {
  id: "admin-test", email: "admin@example.test", fullName: "Administrador",
  role: "admin",
};
const product: Product = {
  id: "iphone12", sku: "IP12-128", name: "iPhone 12 128 GB", categoria: "celular",
  price: 2500000, cost: 1500000, minStock: 0, isActive: true,
  createdAt: "2026-11-04T10:00:00Z", updatedAt: "2026-11-04T10:00:00Z",
};
const order: Order = {
  id: "pedido1", code: "PED-001", customerId: "cliente1", status: "en_preparacion",
  total: 37500000, orderDate: "2026-11-04", createdBy: actor.id,
  createdAt: "2026-11-04T11:00:00Z", updatedAt: "2026-11-04T11:00:00Z",
};
const line: OrderItem = {
  id: "line1", orderId: order.id, productId: product.id, condition: "nuevo",
  quantity: 15, unitPrice: 2500000, subtotal: 37500000,
};
const createUnit = (i: number): Unit => ({
  id: `unit-${i}`, productId: product.id, serial: `imei-test-${i}`,
  condition: "nuevo", status: "en_bodega", cost: 1500000,
  createdBy: actor.id, receivedAt: "2026-11-04T10:00:00Z",
});

describe("Inventario global · un IMEI en pedido nunca vuelve a ofrecerse", () => {
  const setup = () => {
    const db = emptyDb();
    db.products.push({...product});
    db.orders.push({...order});
    db.orderItems.push({...line});
    for (let i=0;i<20;i++) db.units.push(createUnit(i));
    for (let i=0;i<15;i++) {
      db.orderItemUnits.push({
        id: `assignment-${i}`, orderItemId: line.id, unitId: `unit-${i}`,
        createdAt: "2026-11-04T11:30:00Z",
      });
    }
    return db;
  };

  it("20 físicos / 15 en pedido EN PREPARACIÓN / solamente 5 libres en bodega principal", () => {
    const db = setup();
    const stock = getProductStock(db, product.id);
    expect(stock.enSedeFisica).toBe(20);
    expect(stock.enPedidos).toBe(15);
    expect(stock.disponible).toBe(5);
    expect(stock.enBodega).toBe(5);
    expect(stock.enInventario).toBe(5);
    expect(unidadesDescontadasPorPreparacion(db)).toHaveProperty("size",15);
    expect(getDashboard(db).kpis.available).toBe(5);
  });

  it("mantiene apartados los mismos IMEI cuando el pedido cambia a PREPARADO y vuelve a preparación", () => {
    const db = setup();
    db.orders[0].status = "preparado";
    expect(getProductStock(db, product.id).disponible).toBe(5);
    expect(getProductStock(db, product.id).enPedidos).toBe(15);
    db.orders[0].status = "en_preparacion";
    expect(getProductStock(db, product.id).disponible).toBe(5);
    expect(getProductStock(db, product.id).enPedidos).toBe(15);
  });

  it("un pedido CANCELADO no aparta ningún serial aunque quede una relación histórica", () => {
    const db = setup();
    db.orders[0].status = "cancelado";
    const stock = getProductStock(db, product.id);
    expect(stock.enPedidos).toBe(0);
    expect(stock.enBodega).toBe(20);
    expect(stock.disponible).toBe(20);
  });

  it("al confirmar salida, los vendidos no se vuelven disponibles ni se suman como pedidos activos", () => {
    const db = setup();
    db.orders[0].status = "despachado";
    for (let i=0;i<15;i++) db.units[i].status = "vendido";
    const stock = getProductStock(db, product.id);
    expect(stock.enPedidos).toBe(0);
    expect(stock.enSedeFisica).toBe(5);
    expect(stock.vendido).toBe(15);
    expect(stock.disponible).toBe(5);
  });

  it("registrar serial y confirmar venta conserva eventos vinculados al pedido y estado vendido", () => {
    const db = emptyDb();
    db.products.push({...product});
    db.orders.push({...order});
    db.orderItems.push({...line, quantity:1, subtotal:2500000});
    db.units.push(createUnit(0));

    serializarImeiPedido(db,actor,{orderId:order.id,imei:"imei-test-0"});
    expect(getProductStock(db,product.id).enPedidos).toBe(1);
    expect(getProductStock(db,product.id).disponible).toBe(0);
    expect(getUnitTimeline(db,"unit-0").some(e =>
      e.descripcion.includes("asignado al pedido") && e.enlace?.codigo===order.code
    )).toBe(true);

    confirmarPreparacionPedido(db,actor,{orderId:order.id});
    expect(db.units[0].status).toBe("en_bodega");
    confirmarVentaPedido(db,actor,{orderId:order.id});
    expect(db.units[0].status).toBe("vendido");
    expect(getProductStock(db,product.id).enPedidos).toBe(0);
    expect(getProductStock(db,product.id).disponible).toBe(0);
    expect(getUnitTimeline(db,"unit-0").some(e =>
      e.descripcion.includes("venta confirmada") && e.enlace?.codigo===order.code
    )).toBe(true);
  });
});
