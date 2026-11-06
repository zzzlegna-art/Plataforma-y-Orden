import { describe, expect, it } from "vitest";
import { emptyDb } from "../db";
import type { Actor, Db, Unit, Warranty } from "../types";
import {
  entregarGarantia, devolverGarantiasABodega, registrarPagoReembolso, clasificarUnidadDevuelta,
} from "./warranties";

const admin: Actor = { id: "u1", email: "admin@x.com", fullName: "Admin", role: "admin" };
const inspector: Actor = { id: "u2", email: "bodega@x.com", fullName: "Bodega", role: "bodeguero" };
const now = "2026-11-06T00:00:00Z";
const unit = (id = "u1", serial = "351486314095106"): Unit => ({
  id, serial, productId: "p1", status: "en_reparacion", condition: "nuevo", receivedAt: now, createdBy: "u1",
});
const warranty = (values: Partial<Warranty> = {}): Warranty => ({
  id: "w1", code: "GAR-TEST", unitId: "u1", productId: "p1", customerId: "c1",
  reason: "No enciende", status: "reenvio_pendiente", resolucion: "reparado",
  receivedAt: now, createdBy: "u1", ...values,
});
const withWarranty = (values: Partial<Warranty> = {}): Db => {
  const db = emptyDb();
  db.units = [unit()];
  db.warranties = [warranty(values)];
  return db;
};

describe("Garantías: blindaje de inventario, inspección y reembolso", () => {
  const note = "Pantalla, encendido, batería y componentes revisados satisfactoriamente.";

  it("reembolso acordado devuelve a bodega sin afirmar pago", () => {
    const db = withWarranty();
    entregarGarantia(db, admin, { warrantyId: "w1", reembolso: true });
    expect(db.warranties[0].status).toBe("devuelto");
    expect(db.warranties[0].reembolsoAcordado).toBe(true);
    expect(db.warranties[0].reembolsoPagadoAt).toBeUndefined();
    expect(db.units[0].status).toBe("en_bodega");
    expect(db.units[0].condition).toBe("seminuevo");
    expect(db.movements.some(m => m.unitId === "u1" && m.type === "devolucion")).toBe(true);
  });

  it("solo administrador confirma un pago único y documentado", () => {
    const db = withWarranty();
    entregarGarantia(db, admin, { warrantyId: "w1", reembolso: true });
    const input = { warrantyId: "w1", monto: 1750000, metodo: "Transferencia", referencia: "COMP-123" };
    expect(() => registrarPagoReembolso(db, inspector, input)).toThrow();
    expect(() => registrarPagoReembolso(db, admin, { ...input, monto: 0 })).toThrow();
    registrarPagoReembolso(db, admin, input);
    expect(db.warranties[0].reembolsoMonto).toBe(1750000);
    expect(db.warranties[0].reembolsoPagadoAt).toBeTruthy();
    expect(db.warrantyEvents.some(e => e.notes?.includes("REEMBOLSO PAGADO"))).toBe(true);
    expect(() => registrarPagoReembolso(db, admin, input)).toThrow();
  });

  it("no permite registrar pagos sin acuerdo", () => {
    const db = withWarranty();
    expect(() => registrarPagoReembolso(db, admin, {
      warrantyId: "w1", monto: 1000000, metodo: "Efectivo", referencia: "CAJA-12",
    })).toThrow();
  });

  it("cambio de equipo: original NO vendible hasta inspección", () => {
    const db = withWarranty({ resolucion: "cambio" });
    db.units.push({ ...unit("u2", "999999999999999"), status: "en_bodega" });
    entregarGarantia(db, admin, { warrantyId: "w1", replacementUnitId: "u2" });
    expect(db.units[0].status).toBe("en_reparacion");
    expect(db.units[1].status).toBe("entregado_garantia");
    clasificarUnidadDevuelta(db, inspector, {
      warrantyId: "w1", aptoParaVenta: true, observacion: note,
    });
    expect(db.units[0].status).toBe("en_bodega");
    expect(db.movements.some(m => m.unitId === "u1" && m.notes?.includes("apto y disponible"))).toBe(true);
    expect(() => clasificarUnidadDevuelta(db, admin, {
      warrantyId: "w1", aptoParaVenta: true, observacion: note,
    })).toThrow();
  });

  it("inspección defectuosa nunca ingresa existencias vendibles", () => {
    const db = withWarranty({ status: "devuelto" });
    clasificarUnidadDevuelta(db, admin, {
      warrantyId: "w1", aptoParaVenta: false, observacion: "Batería dañada y placa averiada, no apto.",
    });
    expect(db.units[0].status).toBe("defectuoso");
  });

  it("devolución desde recibidos exige constancia y no permite confirmación implícita", () => {
    const db = withWarranty({ status: "recibido", resolucion: undefined });
    expect(() => devolverGarantiasABodega(db, admin, {
      warrantyIds: ["w1"], inspeccionAptaVenta: false, observacionInspeccion: note,
    })).toThrow();
    expect(db.units[0].status).toBe("en_reparacion");
    devolverGarantiasABodega(db, admin, {
      warrantyIds: ["w1"], inspeccionAptaVenta: true, observacionInspeccion: note,
    });
    expect(db.units[0].status).toBe("en_bodega");
    expect(db.warranties[0].status).toBe("devuelto");
    expect(db.warrantyEvents.some(e => e.notes?.includes(note))).toBe(true);
  });
});
