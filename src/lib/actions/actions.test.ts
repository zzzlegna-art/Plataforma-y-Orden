import { describe, expect, it } from "vitest";

import { DomainError, emptyDb } from "../db";
import type { Actor, Db, UnitStatus } from "../types";
import { createCustomer, updateCustomer } from "./customers";
import { cancelarPedidoDespachado, createOrder, finalizarPedido, quitarSerialDespachado } from "./orders";
import { importarSerialesPrevios } from "./seriales-previos";
import { corregirUnitSerial, liberarUnitsLote } from "./units";
import { updateSettings } from "./users";

const admin: Actor = { id: "u1", email: "a@x.com", fullName: "Admin", role: "admin" };
const now = new Date().toISOString();
let contador = 0;
const uid = () => `id-${++contador}`;

/** Un producto, un cliente y un pedido con una unidad asignada por cada estado dado. */
const escenario = (
  estadoPedido: "en_preparacion" | "despachado",
  estados: UnitStatus[],
  categoria: "celular" | "repuesto" = "celular",
): Db => {
  const db = emptyDb();
  db.products.push({ id: "p1", sku: "S", name: "iPhone", categoria, price: 100, cost: 50, minStock: 0, isActive: true, createdAt: now, updatedAt: now });
  db.customers.push({ id: "c1", name: "Cliente", isActive: true, createdAt: now });
  db.orders.push({ id: "o1", code: "PED-1", customerId: "c1", status: estadoPedido, orderDate: now, total: 0, createdBy: "u1", createdAt: now, updatedAt: now });
  db.orderItems.push({ id: "oi1", orderId: "o1", productId: "p1", quantity: estados.length, condition: "nuevo", unitPrice: 100, subtotal: 100 * estados.length });
  estados.forEach((estado, i) => {
    db.units.push({ id: `un${i}`, productId: "p1", serial: `35000000000000${i}`, condition: "nuevo", status: estado, receivedAt: now, createdBy: "u1" });
    db.orderItemUnits.push({ id: uid(), orderItemId: "oi1", unitId: `un${i}`, createdAt: now });
  });
  return db;
};

const clave = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return (error as DomainError).key;
  }
  return undefined;
};

describe("createOrder", () => {
  it("genera el código del día (PED-YYMMDD-NNN) y continúa el consecutivo", () => {
    const db = escenario("despachado", []);
    db.orders = [];
    db.orderItems = [];
    const linea = { productId: "p1", quantity: 1 };
    const primero = createOrder(db, admin, { customerId: "c1", lineas: [linea] });
    const segundo = createOrder(db, admin, { customerId: "c1", lineas: [linea] });
    expect(primero.code).toMatch(/^PED-\d{6}-001$/);
    expect(segundo.code).toBe(primero.code.replace(/001$/, "002"));
  });
});

describe("finalizarPedido", () => {
  it("marca las unidades como vendidas", () => {
    const db = escenario("en_preparacion", ["en_bodega", "en_bodega"]);
    finalizarPedido(db, admin, { orderId: "o1" });
    expect(db.units.map((u) => u.status)).toEqual(["vendido", "vendido"]);
    expect(db.orders[0].status).toBe("despachado");
  });

  it("no despacha si una unidad ya no está disponible", () => {
    const db = escenario("en_preparacion", ["en_bodega", "en_reparacion"]);
    expect(clave(() => finalizarPedido(db, admin, { orderId: "o1" }))).toBe("errors.unitNotAvailable");
  });

  it("no despacha en silencio si una unidad no existe", () => {
    const db = escenario("en_preparacion", ["en_bodega"]);
    db.units = [];
    expect(clave(() => finalizarPedido(db, admin, { orderId: "o1" }))).toBe("errors.notFound");
  });
});

describe("edición de pedidos despachados", () => {
  it("quitar un serial vendido lo devuelve a bodega", () => {
    const db = escenario("despachado", ["vendido", "vendido"]);
    quitarSerialDespachado(db, admin, { orderId: "o1", imei: db.units[0].serial, observacion: "error de captura" });
    expect(db.units[0].status).toBe("en_bodega");
  });

  it("una unidad que entró a garantía NO vuelve a bodega", () => {
    const db = escenario("despachado", ["en_reparacion"]);
    const error = clave(() => quitarSerialDespachado(db, admin, { orderId: "o1", imei: db.units[0].serial, observacion: "x" }));
    expect(error).toBe("errors.unitComprometida");
    expect(db.units[0].status).toBe("en_reparacion");
  });

  it("cancelar un pedido solo revive las unidades que siguen vendidas", () => {
    const db = escenario("despachado", ["vendido", "en_reparacion", "liberado"]);
    cancelarPedidoDespachado(db, admin, { orderId: "o1", motivo: "cliente cancela" });
    expect(db.units.map((u) => u.status)).toEqual(["en_bodega", "en_reparacion", "liberado"]);
    expect(db.auditLogs[0].details).toMatch(/2 unidad\(es\) conservan su estado/);
    expect(db.orders[0].status).toBe("cancelado");
  });
});

describe("corregirUnitSerial", () => {
  it("en un celular exige IMEI válido (15 dígitos y dígito de control)", () => {
    const db = escenario("despachado", ["en_bodega"]);
    expect(clave(() => corregirUnitSerial(db, admin, { id: "un0", nuevoSerial: "12345" }))).toBe("errors.imeiInvalid");
    expect(clave(() => corregirUnitSerial(db, admin, { id: "un0", nuevoSerial: "490154203237519" }))).toBe("errors.imeiChecksum");
    corregirUnitSerial(db, admin, { id: "un0", nuevoSerial: "49-015420-323751-8" });
    expect(db.units[0].serial).toBe("490154203237518");
  });

  it("acepta los códigos internos (ceros al inicio) de equipos que llegaron sin serial", () => {
    const db = escenario("despachado", ["vendido"]);
    for (const codigo of ["000000000000123", "0000000000000200", "000000000009999"]) {
      corregirUnitSerial(db, admin, { id: "un0", nuevoSerial: codigo });
      expect(db.units[0].serial).toBe(codigo);
    }
  });

  it("sigue rechazando lo que no es IMEI ni código interno", () => {
    const db = escenario("despachado", ["vendido"]);
    for (const malo of ["12345", "SL32NKXGV7N", "42112631", "0000123456789012", "00000000000000000"]) {
      expect(clave(() => corregirUnitSerial(db, admin, { id: "un0", nuevoSerial: malo }))).toBe("errors.imeiInvalid");
    }
    expect(clave(() => corregirUnitSerial(db, admin, { id: "un0", nuevoSerial: "350003850711533" }))).toBe("errors.imeiChecksum");
  });

  it("un repuesto acepta cualquier serial", () => {
    const db = escenario("despachado", ["en_bodega"], "repuesto");
    corregirUnitSerial(db, admin, { id: "un0", nuevoSerial: "REP-0099" });
    expect(db.units[0].serial).toBe("REP-0099");
  });
});

describe("liberarUnitsLote", () => {
  it("no libera una unidad apartada en un pedido en preparación", () => {
    const db = escenario("en_preparacion", ["en_bodega"]);
    db.units.push({ id: "libre", productId: "p1", serial: "999000000000009", condition: "nuevo", status: "en_bodega", receivedAt: now, createdBy: "u1" });
    const resultado = liberarUnitsLote(db, admin, { imeis: [db.units[0].serial, "999000000000009"] });
    expect(resultado.map((r) => r.resultado)).toEqual(["no_permitido", "liberado"]);
    expect(db.units.map((u) => u.status)).toEqual(["en_bodega", "liberado"]);
  });
});

describe("auditoría: entityId debe ser un uuid o no estar (la columna es uuid)", () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const sinEntidadInvalida = (db: Db) => db.auditLogs.every((log) => !log.entityId || UUID.test(log.entityId));

  it("guardar los ajustes (empresa y moneda) no escribe un entityId de texto", () => {
    const db = emptyDb();
    updateSettings(db, admin, { companyName: "Bodega 6A", currency: "COP" });
    expect(db.auditLogs).toHaveLength(1);
    expect(db.auditLogs[0].entityId).toBeUndefined();
    expect(db.auditLogs[0].details).toContain("COP");
  });

  it("importar seriales previos tampoco", () => {
    const db = emptyDb();
    const resultado = importarSerialesPrevios(db, admin, { seriales: ["SP-1", "SP-2", "sp-1"] });
    expect(resultado).toEqual({ importados: 2, duplicados: 1 });
    expect(db.auditLogs).toHaveLength(1);
    expect(db.auditLogs[0].entityId).toBeUndefined();
  });

  it("omite seriales ya registrados sin distinguir mayúsculas y minúsculas", () => {
    const db = emptyDb();
    db.serialesPrevios.push({
      id: "prev-1",
      serial: "OLD-1",
      createdBy: admin.id,
      createdAt: now,
    });

    const resultado = importarSerialesPrevios(db, admin, {
      seriales: ["old-1", "NEW-1", "new-1"],
    });

    expect(resultado).toEqual({ importados: 1, duplicados: 2 });
    expect(db.serialesPrevios.map((item) => item.serial)).toEqual(["OLD-1", "NEW-1"]);
  });

  it("despachar y anular pedidos usan siempre el id del pedido", () => {
    const db = escenario("en_preparacion", ["en_bodega"]);
    db.orders[0].id = "11111111-1111-4111-8111-111111111111";
    finalizarPedido(db, admin, { orderId: db.orders[0].id });
    expect(sinEntidadInvalida(db)).toBe(true);
  });
});

describe("createCustomer / updateCustomer · categoría de mayorista", () => {
  it("por defecto un cliente nuevo queda en 'ambos' y siempre es mayorista", () => {
    const db = emptyDb();
    const customer = createCustomer(db, admin, { name: "Cliente sin categoría" });
    expect(customer.categoriaMayorista).toBe("ambos");
    expect(customer.tipo).toBe("mayorista");
  });

  it("se puede elegir la categoría al crear", () => {
    const db = emptyDb();
    const customer = createCustomer(db, admin, { name: "Repuestos SAS", categoriaMayorista: "repuestos" });
    expect(customer.categoriaMayorista).toBe("repuestos");
  });

  it("se puede cambiar la categoría al editar", () => {
    const db = emptyDb();
    const customer = createCustomer(db, admin, { name: "Cliente", categoriaMayorista: "celulares", phone: "3001234567" });
    const actualizado = updateCustomer(db, admin, {
      id: customer.id,
      name: "Cliente",
      phone: "3001234567",
      categoriaMayorista: "repuestos",
    });
    expect(actualizado.categoriaMayorista).toBe("repuestos");
    expect(actualizado.phone).toBe("3001234567");
  });
});
