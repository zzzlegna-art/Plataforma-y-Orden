import { describe,expect,it } from "vitest";
import { describeImeiOrderAssociation } from "./nexora-imei-order-state";

describe("Nexora · estado comercial del IMEI en historial",()=>{
  it("el pedido en preparación no es una venta ni salida",()=>{
    const state=describeImeiOrderAssociation("en_preparacion");
    expect(state.assigned).toBe(true);
    expect(state.label).toContain("Asignado a pedido");
    expect(state.note).toContain("no disponible");
  });
  it("un pedido preparado sigue reteniendo el IMEI",()=>{
    const state=describeImeiOrderAssociation("preparado");
    expect(state.assigned).toBe(true);
    expect(state.note).toContain("pendiente de despacho");
  });
  it("un pedido despachado no se etiqueta como venta",()=>{
    const state=describeImeiOrderAssociation("despachado");
    expect(state.assigned).toBe(false);
    expect(state.label).toBe("Pedido despachado");
  });
  it("no confunde vínculo histórico cancelado con reserva",()=>{
    const state=describeImeiOrderAssociation("cancelado");
    expect(state.assigned).toBe(false);
    expect(state.label).toBe("Pedido cancelado");
  });
});
