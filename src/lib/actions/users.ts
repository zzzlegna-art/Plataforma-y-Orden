/** Acciones de administración: perfiles de personal y datos de la empresa.
 *
 *  Las cuentas (correo y contraseña) las administra el servicio de autenticación
 *  del backend: cada persona se registra desde la pantalla de inicio de sesión y
 *  aquí solo se le asigna el rol y el estado. */

import { DomainError, logAudit } from "../db";
import type { Actor, Db, Role, User } from "../types";
import { requirePermission, requireText } from "./guards";

const activeAdmins = (db: Db) =>
  db.users.filter((user) => user.role === "admin" && user.isActive);

export const updateUser = (
  db: Db,
  actor: Actor,
  input: { id: string; role?: Role; isActive?: boolean },
): User => {
  requirePermission(actor, "users.manage");
  const user = db.users.find((item) => item.id === input.id);
  if (!user) throw new DomainError("errors.notFound");
  if (user.id === actor.id) throw new DomainError("errors.cannotEditSelf");

  if (input.role && input.role !== user.role) {
    if (user.role === "admin" && activeAdmins(db).length <= 1) {
      throw new DomainError("errors.lastAdmin");
    }
    user.role = input.role;
  }

  if (input.isActive !== undefined && input.isActive !== user.isActive) {
    if (!input.isActive && user.role === "admin" && activeAdmins(db).length <= 1) {
      throw new DomainError("errors.lastAdmin");
    }
    user.isActive = input.isActive;
  }

  logAudit(db, actor, {
    action: "update",
    entity: "user",
    entityId: user.id,
    details: `${user.email} · ${user.role}${user.isActive ? "" : " · inactivo"}`,
  });
  return user;
};

export const updateSettings = (
  db: Db,
  actor: Actor,
  input: { companyName: string; currency: string },
) => {
  requirePermission(actor, "users.manage");
  db.settings.companyName = requireText(input.companyName, "errors.companyNameRequired");
  db.settings.currency = requireText(input.currency, "errors.currencyRequired");
  logAudit(db, actor, {
    action: "update",
    entity: "session",
    // Sin entityId: la columna es uuid y los ajustes no son una fila con id propio.
    details: `Ajustes: ${db.settings.companyName} · ${db.settings.currency}`,
  });
  return db.settings;
};
