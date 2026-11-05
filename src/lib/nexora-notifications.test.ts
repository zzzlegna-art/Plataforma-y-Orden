import { describe, expect, it } from "vitest";
import { countUnreadNotifications, notificationCreatedDate, notificationDestination, notificationIsImportant } from "./nexora-notifications";

describe("Nexora · centro de notificaciones", () => {
  it("enlaza cada aviso con el traslado indicado por el servidor", () => {
    expect(notificationDestination({ transfer_id: "a9b8c7d6-1111-2222-3333-e4f5a6b7c8d9" }))
      .toBe("/traslados?transfer=a9b8c7d6-1111-2222-3333-e4f5a6b7c8d9");
    expect(notificationDestination({ transfer_id: null })).toBe("/traslados");
    expect(notificationDestination({ transfer_id: "malicious/path?x=1" })).toBe("/traslados");
  });

  it("interpreta timestamps del esquema SQL como UTC", () => {
    expect(notificationCreatedDate("2026-11-05 16:00:00").toISOString()).toBe("2026-11-05T16:00:00.000Z");
  });

  it("no cuenta como nuevos los avisos ya leídos", () => {
    expect(countUnreadNotifications([{ read: false }, { read: true }, { read: false }])).toBe(2);
    expect(countUnreadNotifications([])).toBe(0);
  });

  it("destaca las incidencias físicas sin confundir asignaciones con ventas", () => {
    expect(notificationIsImportant("transfer_missing")).toBe(true);
    expect(notificationIsImportant("transfer_cancelled")).toBe(true);
    expect(notificationIsImportant("transfer_dispatched")).toBe(false);
  });
});
