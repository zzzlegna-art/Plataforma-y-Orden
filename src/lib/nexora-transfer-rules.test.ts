import { describe, expect, it } from "vitest";
import {
  planTransferReceipt,
  validateTransferRoute,
  type TransferSite,
  type DispatchedSerial,
  TransferReceiptValidationError,
} from "./nexora-transfer-rules";

const site = (
  id: string, kind: TransferSite["kind"], cityId: string,
  parent: string | null = null,
): TransferSite => ({
  id, kind, city_id: cityId, parent_warehouse_id: parent, is_active: true,
});

const principal = site("principal", "principal", "city-a");
const bodegaA = site("warehouse-a", "bodega", "city-a");
const localA = site("store-a", "local", "city-a", "warehouse-a");
const localB = site("store-b", "local", "city-a", "warehouse-a");
const regionalB = site("warehouse-b", "bodega", "city-b");

describe("rutas autorizadas para transferencias multisede", () => {
  it("permite sede principal → bodega de otra ciudad", () => {
    expect(validateTransferRoute(principal, regionalB)).toEqual({ allowed: true });
  });
  it("permite bodega → bodega regional sin autorización previa adicional", () => {
    expect(validateTransferRoute(bodegaA, regionalB)).toEqual({ allowed: true });
    expect(validateTransferRoute(regionalB, bodegaA)).toEqual({ allowed: true });
  });
  it("permite bodega → su local y local → bodega", () => {
    expect(validateTransferRoute(bodegaA, localA)).toEqual({ allowed: true });
    expect(validateTransferRoute(localA, bodegaA)).toEqual({ allowed: true });
    expect(validateTransferRoute(localA, regionalB).allowed).toBe(false);
    expect(validateTransferRoute(localA, principal).allowed).toBe(false);
  });
  it("no permite nunca local → local", () => {
    expect(validateTransferRoute(localA, localB).allowed).toBe(false);
  });
  it("local no recibe de bodega no asignada ni de otra ciudad", () => {
    expect(validateTransferRoute(regionalB, localA).allowed).toBe(false);
    expect(validateTransferRoute(principal, localA).allowed).toBe(false);
  });
  it("impide enviar a sí mismo o desde un lugar inactivo", () => {
    expect(validateTransferRoute(localA, localA).allowed).toBe(false);
    expect(validateTransferRoute({ ...bodegaA, is_active: false }, localA).allowed).toBe(false);
  });
  it("un local dependiente de la sede principal puede recibir de ella", () => {
    const localPrincipal = site("local-principal", "local", "city-a", "principal");
    expect(validateTransferRoute(principal, localPrincipal)).toEqual({ allowed: true });
  });
});

const dispatched: DispatchedSerial[] = Array.from({ length: 20 }, (_, i) => ({
  unitId: `unit-${i + 1}`,
  serial: String(350000000000001 + i),
}));
const receivedSerials = dispatched.slice(0, 15).map((unit) => unit.serial);
const missing = dispatched.slice(15).map((unit) => ({
  serial: unit.serial,
  observation: "El celular no llegó físicamente al local.",
}));

describe("recepción de traslados: diferencia y devolución al origen", () => {
  it("20 despachados, 15 recibidos y 5 devueltos automáticamente PENDIENTES de recepción", () => {
    const result = planTransferReceipt(dispatched, receivedSerials, missing);
    expect(result.dispatchedCount).toBe(20);
    expect(result.receivedCount).toBe(15);
    expect(result.missingCount).toBe(5);
    expect(result.receivedUnitIds).toEqual(dispatched.slice(0, 15).map((unit) => unit.unitId));
    expect(result.pendingOriginReturn).toEqual(dispatched.slice(15).map((unit) => ({
      unitId: unit.unitId,
      serial: unit.serial,
      observation: "El celular no llegó físicamente al local.",
    })));
    // Una unidad no recibida NO se habilita en ninguna sede por esta función.
    expect(result.receivedUnitIds).not.toContain("unit-16");
  });

  it("permite recepción completa sin devolución", () => {
    const result = planTransferReceipt(dispatched, dispatched.map((u) => u.serial), []);
    expect(result.receivedCount).toBe(20);
    expect(result.pendingOriginReturn).toHaveLength(0);
  });

  it("exige observación por IMEI marcado como faltante", () => {
    expect(() => planTransferReceipt(dispatched, receivedSerials, [
      ...missing.slice(0, -1), { ...missing[4], observation: " " },
    ])).toThrow(/observación/i);
  });

  it("impide doble marcado, IMEI ajeno y asignaciones aún sin verificar", () => {
    expect(() => planTransferReceipt(dispatched, [...receivedSerials, receivedSerials[0]], missing))
      .toThrow(TransferReceiptValidationError);
    expect(() => planTransferReceipt(dispatched, [...receivedSerials, "999999999999999"], missing))
      .toThrow(/no pertenece/i);
    expect(() => planTransferReceipt(dispatched, receivedSerials, missing.slice(0, 4)))
      .toThrow(/Marca cada IMEI/i);
    expect(() => planTransferReceipt(dispatched, receivedSerials, [
      ...missing, { serial: receivedSerials[0], observation: "No llegó" },
    ])).toThrow(/incompatibles/i);
  });

  it("rechaza despachos con IMEI duplicado o vacíos", () => {
    expect(() => planTransferReceipt([...dispatched, dispatched[0]], receivedSerials, missing))
      .toThrow(/duplicado/i);
    expect(() => planTransferReceipt([
      ...dispatched, { unitId: dispatched[0].unitId, serial: "999999999999999" },
    ], receivedSerials, missing)).toThrow(/duplicado/i);
    expect(() => planTransferReceipt([], [], [])).toThrow(/No hay equipos/i);
  });

  it("normaliza espacios al comparar códigos sin alterar el serial histórico", () => {
    const unit = [{ unitId: "id", serial: "  350000000000001 " }];
    const result = planTransferReceipt(unit, ["350000000000001"], []);
    expect(result.receivedUnitIds).toEqual(["id"]);
  });
});
