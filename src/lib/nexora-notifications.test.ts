import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { formatNotificationDate, notificationHref, notificationIsUrgent, notificationTimestamp } from "./nexora-notifications";

describe("Centro de notificaciones · rutas y avisos persistentes", () => {
  it("abre un traslado concreto sin inventar enlaces", () => {
    expect(notificationHref({ transfer_id: "123abc" })).toBe("/traslados?transfer=123abc");
    expect(notificationHref({ transfer_id: null })).toBe("/notificaciones");
  });
  it("mantiene las fechas de la tabla legacy en UTC", () => {
    expect(notificationTimestamp("2026-11-05 10:40:00").toISOString()).toBe("2026-11-05T10:40:00.000Z");
    expect(formatNotificationDate("2026-11-05 10:40:00")).not.toContain("no disponible");
    expect(formatNotificationDate("unrecognized")).toBe("Fecha no disponible");
  });
  it("prioriza faltantes sin alterar el tipo guardado", () => {
    expect(notificationIsUrgent({ type: "transfer_missing" })).toBe(true);
    expect(notificationIsUrgent({ type: "transfer_dispatched" })).toBe(false);
  });
});
