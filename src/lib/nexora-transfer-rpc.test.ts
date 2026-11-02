import { describe, expect, it } from "vitest";
import {
  buildOriginReturnRpcArgs, buildTransferReceiptRpcArgs,
} from "./nexora-transfer-rpc";
import { planTransferReceipt } from "./nexora-transfer-rules";

const dispatched = Array.from({ length: 20 }, (_, index) => ({
  unitId: `unit-${index + 1}`,
  serial: String(350000000000001 + index),
}));

describe("contratos RPC para traslados multisede", () => {
  it("construye 15 recepciones y 5 faltantes con su observación", () => {
    const plan = planTransferReceipt(
      dispatched,
      dispatched.slice(0, 15).map((unit) => unit.serial),
      dispatched.slice(15).map((unit) => ({
        serial: unit.serial,
        observation: "El celular no llegó",
      })),
    );
    const args = buildTransferReceiptRpcArgs("transfer-1", dispatched, plan);
    expect(args.p_transfer_id).toBe("transfer-1");
    expect(args.p_decisions).toHaveLength(20);
    expect(args.p_decisions.filter((unit) => unit.decision === "recibido")).toHaveLength(15);
    expect(args.p_decisions.filter((unit) => unit.decision === "no_llego")).toHaveLength(5);
    expect(args.p_decisions[19]).toEqual({
      unit_id: "unit-20", decision: "no_llego", observation: "El celular no llegó",
    });
  });

  it("rechaza cualquier discrepancia entre IMEI y decisiones del usuario", () => {
    const plan = planTransferReceipt(
      dispatched, dispatched.map((item) => item.serial), [],
    );
    expect(() => buildTransferReceiptRpcArgs("transfer-1", dispatched, {
      ...plan, receivedCount: 19,
    })).toThrow(/cantidades/i);
    expect(() => buildTransferReceiptRpcArgs("transfer-1", [...dispatched, dispatched[0]], plan))
      .toThrow(/documento|duplicados/i);
    expect(() => buildTransferReceiptRpcArgs("", dispatched, plan)).toThrow(/documento/i);
  });

  it("solo devuelve al stock equipos encontrados físicamente, con observación en el resto", () => {
    const pending = dispatched.slice(15);
    const verified = buildOriginReturnRpcArgs("ret-1", pending,
      pending.map((unit, i) => ({
        unitId: unit.unitId,
        found: i < 3,
        observation: i < 3 ? "" : "No se encontró el celular",
      })),
    );
    expect(verified.p_rows.filter((item) => item.present)).toHaveLength(3);
    expect(verified.p_rows.filter((item) => !item.present)).toHaveLength(2);
    expect(verified.p_rows[4].observation).toBe("No se encontró el celular");
  });

  it("prohíbe cerrar una devolución sin observaciones para IMEI no encontrados", () => {
    expect(() => buildOriginReturnRpcArgs("ret-1", dispatched.slice(0, 1), [
      { unitId: "unit-1", found: false },
    ])).toThrow(/observación/i);
  });
});
