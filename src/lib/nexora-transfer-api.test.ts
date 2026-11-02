import { describe, expect, it, vi } from "vitest";
import { planTransferReceipt } from "./nexora-transfer-rules";
import {
  dispatchMultisiteTransfer,
  receiveMultisiteTransfer,
  verifyMultisiteOriginReturn,
  MultisiteTransferError,
} from "./nexora-transfer-api";

const sent = Array.from({ length: 20 }, (_, index) => ({
  unitId: `uuid-${index + 1}`,
  serial: String(350000000000001 + index),
}));
const received = sent.slice(0, 15).map((unit) => unit.serial);
const missing = sent.slice(15).map((unit) => ({
  serial: unit.serial,
  observation: "No llegó físicamente al local",
}));
const plan = planTransferReceipt(sent, received, missing);
const ok = (data: Record<string, unknown>) => ({ data, error: null });

describe("API de transferencias multisede: sin cambios optimistas de inventario", () => {
  it("despacha un lote usando UUID estable y valida el documento respondido", async () => {
    const rpc = vi.fn(async () => ok({
      transferId: "transfer-1", status: "en_transito", idempotent: false, dispatchedCount: 20,
    }));
    const result = await dispatchMultisiteTransfer({
      transferId: "transfer-1", originSiteId: "bodega-a", destinationSiteId: "bodega-b",
      unitIds: sent.map((unit) => unit.unitId), rpc,
    });
    expect(result.status).toBe("en_transito");
    expect(rpc).toHaveBeenCalledWith("nexora_dispatch_transfer", {
      p_transfer_id: "transfer-1", p_origin: "bodega-a",
      p_destination: "bodega-b", p_unit_ids: sent.map((unit) => unit.unitId),
    });
  });

  it("impide despachos con IMEI repetidos sin llamar al servidor", async () => {
    const rpc = vi.fn(async () => ok({ transferId: "transfer-1", status: "en_transito", idempotent: false }));
    await expect(dispatchMultisiteTransfer({
      transferId: "transfer-1", originSiteId: "bodega-a", destinationSiteId: "bodega-b",
      unitIds: ["imei-1", "imei-1"], rpc,
    })).rejects.toThrow(/duplicados/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("20 despachados: el servidor confirma 15 recibidos y 5 faltantes con retorno", async () => {
    const rpc = vi.fn(async () => ok({
      transferId: "transfer-1", returnId: "return-1",
      status: "recepcion_parcial", idempotent: false,
      receivedCount: 15, missingCount: 5,
    }));
    const result = await receiveMultisiteTransfer({ transferId: "transfer-1", dispatched: sent, plan, rpc });
    expect(result.returnId).toBe("return-1");
    expect(rpc).toHaveBeenCalledWith("nexora_receive_transfer", {
      p_transfer_id: "transfer-1",
      p_decisions: expect.arrayContaining([
        { unit_id: "uuid-1", decision: "recibido", observation: "" },
        { unit_id: "uuid-20", decision: "no_llego", observation: "No llegó físicamente al local" },
      ]),
    });
  });

  it("no interpreta como éxito una respuesta con otro conteo", async () => {
    const rpc = vi.fn(async () => ok({
      transferId: "transfer-1", status: "recepcion_parcial", idempotent: false,
      receivedCount: 16, missingCount: 4,
    }));
    await expect(receiveMultisiteTransfer({
      transferId: "transfer-1", dispatched: sent, plan, rpc,
    })).rejects.toThrow(/no coincide/);
  });

  it("un reintento idempotente confirmado no genera otra recepción", async () => {
    const rpc = vi.fn(async () => ok({
      transferId: "transfer-1", returnId: "return-1",
      status: "recepcion_parcial", idempotent: true, receivedCount: 15, missingCount: 5,
    }));
    const result = await receiveMultisiteTransfer({ transferId: "transfer-1", dispatched: sent, plan, rpc });
    expect(result.idempotent).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("la caída de red nunca se da por confirmación ni dispara un segundo envío", async () => {
    const rpc = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    await expect(receiveMultisiteTransfer({
      transferId: "transfer-1", dispatched: sent, plan, rpc,
    })).rejects.toThrow(/Se perdió la comunicación/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("avisa cuando todavía no existen las migraciones en Supabase", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "PGRST202", message: "RPC missing" } }));
    await expect(receiveMultisiteTransfer({
      transferId: "transfer-1", dispatched: sent, plan, rpc,
    })).rejects.toThrow(/todavía no están habilitados/);
  });

  it("origen verifica 3 devoluciones y deja 2 incidencias en el servidor", async () => {
    const rpc = vi.fn(async () => ok({
      returnId: "return-1", status: "incidencia", idempotent: false,
      verifiedCount: 3, incidentCount: 2,
    }));
    const pendingUnits = sent.slice(15);
    const review = pendingUnits.map((unit, index) => ({
      unitId: unit.unitId, found: index < 3,
      observation: index < 3 ? "" : "Sigue sin aparecer físicamente",
    }));
    const result = await verifyMultisiteOriginReturn({
      returnId: "return-1", pendingUnits, review, rpc,
    });
    expect(result.status).toBe("incidencia");
    expect(rpc).toHaveBeenCalledWith("nexora_verify_origin_return", {
      p_return_id: "return-1",
      p_rows: expect.arrayContaining([
        { unit_id: "uuid-16", present: true, observation: "" },
        { unit_id: "uuid-20", present: false, observation: "Sigue sin aparecer físicamente" },
      ]),
    });
  });

  it("rechaza una respuesta inválida sin suponer que se movió el inventario", async () => {
    const rpc = vi.fn(async () => ok({ status: "recibido" }));
    await expect(receiveMultisiteTransfer({
      transferId: "transfer-1", dispatched: sent, plan, rpc,
    })).rejects.toBeInstanceOf(MultisiteTransferError);
  });
});
