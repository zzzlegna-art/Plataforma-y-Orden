import { describe, expect, it } from "vitest";
import { emptyDb, DomainError } from "../db";
import type { Actor, Db } from "../types";
import { getWarrantyOrigin } from "../warranty-origin";
import { garantiaSinImeiPendiente } from "../warranty-pending-imei";
import {
  createWarrantySinImei,
  createWarrantiesByImeisYSinSerial,
  devolverGarantia,
  devolverGarantiasABodega,
  entregarGarantia,
  registrarDiagnostico,
  registrarImeiRealGarantia,
} from "./warranties";

const actor: Actor = {
  id: "empleado-test", email: "test@example.test", fullName: "Operador", role: "admin",
};
const TEMP = "000000001234567";
const TEMP2 = "000000001234568";
const IMEI_REAL = "490154203237518";
const IMEI_PREVIO = "356938035643809";
const fecha = "2026-11-20T12:00:00Z";
const fixture = (): Db => {
  const db = emptyDb();
  db.products.push({
    id: "phone", name: "iPhone 13 128 GB", sku: "PHONE-13", categoria: "celular",
    minStock: 0, isActive: true, createdAt: fecha, updatedAt: fecha,
  });
  db.customers.push({
    id: "cliente", name: "Cliente de la venta", isActive: true, createdAt: fecha,
  });
  db.units.push({
    id: "unit1", productId: "phone", serial: IMEI_REAL, condition: "seminuevo",
    status: "vendido", receivedAt: fecha, createdBy: actor.id,
  });
  db.orders.push({
    id: "pedido", customerId: "cliente", code: "PED-TEST", status: "despachado",
    orderDate: fecha, createdBy: actor.id, createdAt: fecha, updatedAt: fecha,
  });
  db.orderItems.push({
    id: "linea", orderId: "pedido", productId: "phone", quantity: 1,
  });
  db.orderItemUnits.push({
    id: "link", orderItemId: "linea", unitId: "unit1", createdAt: fecha,
  });
  return db;
};
const intake = (db: Db, codigoTemporal = TEMP) => createWarrantySinImei(db, actor, {
  codigoTemporal,
  referenciaManual: "iPhone 13 128 GB",
  clienteManual: "Cliente que entrega",
  observacion: "No enciende, sin acceso al IMEI",
});

describe("Garantías apagado / sin serial en recepción por IMEI", () => {
  it("genera un expediente visible con código temporal, cliente y observaciones sin inventar una unidad", () => {
    const db = fixture();
    const warranty = intake(db);
    expect(warranty).toEqual(expect.objectContaining({
      imeiManual: TEMP,
      clienteManual: "Cliente que entrega",
      referenciaManual: "iPhone 13 128 GB",
      reason: "No enciende, sin acceso al IMEI",
      status: "recibido",
    }));
    expect(garantiaSinImeiPendiente(warranty)).toBe(true);
    expect(getWarrantyOrigin(warranty)).toBe("normal");
    expect(db.units).toHaveLength(1);
    expect(db.movements.filter((movement) => movement.type === "garantia")).toHaveLength(0);
  });

  it("procesa un lote mezclado de IMEI normal y equipos apagados conservando ambas observaciones", () => {
    const db = fixture();
    const results = createWarrantiesByImeisYSinSerial(db, actor, { items: [
      { imei: IMEI_REAL, observacion: "Batería agotada" },
      { imei: TEMP, observacion: "Pantalla apagada", sinImei: true,
        clienteManual: "Cliente uno", referenciaManual: "iPhone 13 128 GB" },
      { imei: TEMP2, observacion: "No carga", sinImei: true,
        clienteManual: "Cliente dos", referenciaManual: "iPhone 13 128 GB" },
    ] });
    expect(results.map((item) => item.ok)).toEqual([true, true, true]);
    expect(db.warranties).toHaveLength(3);
    expect(db.warranties.find((item) => item.imeiManual === TEMP)?.clienteManual).toBe("Cliente uno");
    expect(db.warranties.find((item) => item.imeiManual === TEMP2)?.reason).toBe("No carga");
    expect(db.units).toHaveLength(1);
    expect(db.units[0].status).toBe("en_reparacion");
  });

  it("bloquea diagnóstico, devolución y cierre hasta registrar IMEI real", () => {
    const db = fixture();
    const warranty = intake(db);
    expect(() => registrarDiagnostico(db, actor, {
      warrantyId: warranty.id, diagnostico: "Reparado", resolucion: "reparado",
    })).toThrow(DomainError);
    expect(() => devolverGarantia(db, actor, { warrantyId: warranty.id, motivo: "Devuelto" })).toThrow(DomainError);
    expect(() => devolverGarantiasABodega(db, actor, {
      warrantyIds: [warranty.id], inspeccionAptaVenta: true,
      observacionInspeccion: "Inspección física completa del equipo.",
    })).toThrow(DomainError);
    warranty.status = "reenvio_pendiente";
    expect(() => entregarGarantia(db, actor, { warrantyId: warranty.id })).toThrow(DomainError);
    expect(db.warranties).toHaveLength(1);
  });

  it("reconcilia el IMEI real con el equipo vendido y su pedido sin perder el mismo expediente", () => {
    const db = fixture();
    const warranty = intake(db);
    const result = registrarImeiRealGarantia(db, actor, { warrantyId: warranty.id, imei: IMEI_REAL });
    expect(result.id).toBe(warranty.id);
    expect(result.unitId).toBe("unit1");
    expect(result.orderId).toBe("pedido");
    expect(result.customerId).toBe("cliente");
    expect(result.clienteManual).toBe("Cliente que entrega");
    expect(result.imeiManual).toBeUndefined();
    expect(garantiaSinImeiPendiente(result)).toBe(false);
    expect(db.units).toHaveLength(1);
    expect(db.units[0].status).toBe("en_reparacion");
    expect(db.movements.filter((movement) => movement.type === "garantia")).toHaveLength(1);
    expect(db.warrantyEvents.some((event) => event.notes?.includes(IMEI_REAL))).toBe(true);
    registrarDiagnostico(db, actor, {
      warrantyId: warranty.id, diagnostico: "Falla corregida", resolucion: "reparado",
    });
    expect(warranty.status).toBe("reenvio_pendiente");
  });

  it("admite un IMEI real de una venta anterior sin crear inventario ficticio", () => {
    const db = fixture();
    const warranty = intake(db);
    registrarImeiRealGarantia(db, actor, { warrantyId: warranty.id, imei: IMEI_PREVIO });
    expect(warranty.imeiManual).toBe(IMEI_PREVIO);
    expect(warranty.unitId).toBeUndefined();
    expect(garantiaSinImeiPendiente(warranty)).toBe(false);
    expect(getWarrantyOrigin(warranty)).toBe("previa");
    expect(db.units).toHaveLength(1);
  });

  it("rechaza IMEI incorrecto y un código temporal como IMEI real", () => {
    const db = fixture();
    const warranty = intake(db);
    expect(() => registrarImeiRealGarantia(db, actor, { warrantyId: warranty.id, imei: TEMP2 })).toThrow(DomainError);
    // Los quince ceros pasan Luhn, pero son un código interno, no un IMEI real.
    expect(() => registrarImeiRealGarantia(db, actor, {
      warrantyId: warranty.id, imei: "000000000000000",
    })).toThrow(DomainError);
    expect(() => registrarImeiRealGarantia(db, actor, { warrantyId: warranty.id, imei: "123456789012345" })).toThrow(DomainError);
    expect(garantiaSinImeiPendiente(warranty)).toBe(true);
  });

  it("no deja duplicar el código temporal en otro expediente", () => {
    const db = fixture();
    intake(db);
    expect(() => intake(db)).toThrow(DomainError);
    expect(db.warranties).toHaveLength(1);
  });
});
