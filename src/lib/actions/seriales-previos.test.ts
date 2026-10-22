import { describe, expect, it } from "vitest";

import { emptyDb, DomainError } from "../db";
import type { Actor, SerialPrevio } from "../types";
import { importarSerialesPrevios } from "./seriales-previos";

const admin: Actor = {
  id: "admin-1",
  email: "admin@example.com",
  fullName: "Admin",
  role: "admin",
};

const worker: Actor = {
  id: "worker-1",
  email: "worker@example.com",
  fullName: "Trabajador",
  role: "bodeguero",
};

const previous = (serial: string): SerialPrevio => ({
  id: `id-${serial}`,
  serial,
  createdBy: admin.id,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("importarSerialesPrevios", () => {
  it("imports unique serials and ignores case-insensitive duplicates in the file and database", () => {
    const db = emptyDb();
    db.serialesPrevios.push(previous("OLD-001"));

    const result = importarSerialesPrevios(db, admin, {
      seriales: ["OLD-001", "new-001", "NEW-001", " new-002 ", "", "new-002"],
    });

    expect(result).toEqual({ importados: 2, duplicados: 3 });
    expect(db.serialesPrevios.map((item) => item.serial)).toEqual(["OLD-001", "new-001", "new-002"]);
    expect(db.auditLogs).toHaveLength(1);
    expect(db.auditLogs[0].details).toContain("2 seriales previos importados");
  });

  it("rejects imports by a bodeguero", () => {
    expect(() => importarSerialesPrevios(emptyDb(), worker, { seriales: ["SN-1"] }))
      .toThrow(DomainError);
  });

  it("rejects batches above 20,000 serials", () => {
    expect(() => importarSerialesPrevios(emptyDb(), admin, {
      seriales: Array.from({ length: 20_001 }, (_, index) => `SN-${index}`),
    })).toThrow(DomainError);
  });

  it("does not add an audit record when every serial is duplicated", () => {
    const db = emptyDb();
    db.serialesPrevios.push(previous("SN-1"));

    expect(importarSerialesPrevios(db, admin, { seriales: ["SN-1", "sn-1"] }))
      .toEqual({ importados: 0, duplicados: 2 });
    expect(db.auditLogs).toHaveLength(0);
  });
});
