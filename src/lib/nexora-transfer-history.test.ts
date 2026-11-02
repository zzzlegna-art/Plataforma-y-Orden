import { describe, expect, it } from "vitest";
import { mapMultisiteSerialTimeline } from "./nexora-transfer-history";

const sites = [
  { id: "central", city_id: "c1", name: "Bodega Principal" },
  { id: "regional", city_id: "c2", name: "Bodega Regional" },
  { id: "local", city_id: "c2", name: "Local Centro" },
];
const cities = [{ id: "c1", name: "Ciudad A" }, { id: "c2", name: "Ciudad B" }];
const transfers = [
  { id: "t1", code: "TRA-001", origin_site_id: "central",
    destination_site_id: "regional", kind: "envio", status: "recibido" },
  { id: "t2", code: "TRA-002", origin_site_id: "regional",
    destination_site_id: "local", kind: "envio", status: "recepcion_parcial" },
  { id: "r2", code: "RET-002", origin_site_id: "local",
    destination_site_id: "regional", kind: "retorno_faltantes", status: "incidencia" },
];
const event = (
  id: string, transfer_id: string, event_type: string,
  details: Record<string, unknown> = {}, unit_id = "imei-1",
) => ({ id, transfer_id, event_type, details, unit_id, created_at: `2026-11-01T10:00:0${id.length}Z` });

describe("Hoja de vida global IMEI entre ciudades", () => {
  it("explica el recorrido y las incidencias con ciudad, punto y observaciones", () => {
    const events = [
      event("1", "t1", "despachado"),
      event("22", "t1", "recepcion_confirmada"),
      event("333", "t2", "despachado"),
      event("4444", "t2", "faltante_reportado", { observation: "No llegó en la caja" }),
      event("55555", "r2", "incidencia", { observation: "Equipo no encontrado" }),
    ];
    const timeline = mapMultisiteSerialTimeline("imei-1", events, transfers, sites, cities);
    expect(timeline).toHaveLength(5);
    expect(timeline[0].description).toContain("Bodega Principal · Ciudad A");
    expect(timeline[0].description).toContain("Bodega Regional · Ciudad B");
    expect(timeline[1].description).toContain("verificado físicamente");
    expect(timeline[3].title).toBe("Faltante reportado");
    expect(timeline[3].description).toContain("No llegó en la caja");
    expect(timeline[4].title).toContain("Incidencia · IMEI sin localizar");
    expect(timeline[4].description).toContain("Equipo no encontrado");
    expect(timeline[4].description).toContain("Sigue sin estar disponible");
  });

  it("no incorpora eventos de otro IMEI aunque estén en el mismo traslado", () => {
    const events = [
      event("1", "t1", "despachado"),
      event("2", "t1", "despachado", {}, "otro-imei"),
      event("3", "t1", "devolucion_generada"),
    ];
    const timeline = mapMultisiteSerialTimeline("imei-1", events, transfers, sites, cities);
    expect(timeline).toHaveLength(1);
  });

  it("no inventa ciudades para puntos físicos sin datos verificados", () => {
    const timeline = mapMultisiteSerialTimeline("imei-1", [
      event("1", "t1", "despachado"),
    ], transfers, [], []);
    expect(timeline[0].origin).toBe("Sede no identificada");
  });

  it("permite registrar retorno físico verificado en la bodega original", () => {
    const timeline = mapMultisiteSerialTimeline("imei-1", [
      event("1", "r2", "retorno_verificado"),
    ], transfers, sites, cities);
    expect(timeline[0].title).toBe("Retorno recibido en origen");
    expect(timeline[0].description).toContain("Bodega Regional · Ciudad B");
  });
});
