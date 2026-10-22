import { describe, expect, it } from "vitest";

import { DomainError, emptyDb } from "../db";
import type { Actor, Db, Role, User } from "../types";
import { updateUser } from "./users";

const adminActor: Actor = {
  id: "admin-1",
  email: "admin@example.com",
  fullName: "Administradora",
  role: "admin",
};

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: "admin-1",
  email: "admin@example.com",
  fullName: "Administradora",
  role: "admin",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const makeDb = (...users: User[]): Db => {
  const db = emptyDb();
  db.users = users;
  return db;
};

const domainErrorKey = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return (error as DomainError).key;
  }
  return undefined;
};

describe("gestión de cuentas del personal", () => {
  it("impide que un administrador modifique su propia cuenta", () => {
    const db = makeDb(makeUser());

    expect(domainErrorKey(() => updateUser(db, adminActor, {
      id: adminActor.id,
      isActive: false,
    }))).toBe("errors.cannotEditSelf");
  });

  it("impide degradar al último administrador activo", () => {
    const db = makeDb(makeUser());

    expect(domainErrorKey(() => updateUser(db, adminActor, {
      id: adminActor.id,
      role: "bodeguero",
    }))).toBe("errors.cannotEditSelf");
  });

  it("impide desactivar al último administrador activo desde otra cuenta", () => {
    const actor = { ...adminActor, id: "admin-2", email: "admin2@example.com" };
    const db = makeDb(
      makeUser(),
      makeUser({ id: "admin-2", email: "admin2@example.com" }),
    );
    db.users = [makeUser({ id: "admin-1" }), makeUser({ id: "admin-2", email: "admin2@example.com" })];
    // El segundo administrador no puede desactivarse a sí mismo; se prueba el último administrador restante.
    const targetDb = makeDb(makeUser({ id: "admin-1" }));
    expect(domainErrorKey(() => updateUser(targetDb, actor, {
      id: "admin-1",
      isActive: false,
    }))).toBe("errors.lastAdmin");
    expect(db.users).toHaveLength(2);
  });

  it("deniega cambios de cuentas a un trabajador", () => {
    const worker: Actor = {
      id: "worker-1",
      email: "worker@example.com",
      fullName: "Trabajador",
      role: "bodeguero",
    };
    const db = makeDb(makeUser({ id: "admin-1" }));

    expect(domainErrorKey(() => updateUser(db, worker, {
      id: "admin-1",
      role: "bodeguero" as Role,
    }))).toBe("errors.forbidden");
  });

  it("permite desactivar un administrador si queda otro activo y registra auditoría", () => {
    const actor = { ...adminActor, id: "admin-2", email: "admin2@example.com" };
    const db = makeDb(
      makeUser({ id: "admin-1" }),
      makeUser({ id: "admin-2", email: "admin2@example.com" }),
    );

    const updated = updateUser(db, actor, { id: "admin-1", isActive: false });

    expect(updated.isActive).toBe(false);
    expect(db.users.filter((user) => user.role === "admin" && user.isActive)).toHaveLength(1);
    expect(db.auditLogs[0]).toMatchObject({
      userId: actor.id,
      entity: "user",
      entityId: "admin-1",
      action: "update",
    });
  });
});
