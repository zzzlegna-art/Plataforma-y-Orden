import { DomainError } from "../db";
import { can, type Permission } from "../permissions";
import type { Actor } from "../types";

/** Verifica permisos antes de tocar los datos. */
export const requirePermission = (actor: Actor, permission: Permission) => {
  if (!can(actor.role, permission)) {
    throw new DomainError("errors.forbidden");
  }
};

/** Exige un texto obligatorio. */
export const requireText = (value: string | undefined, key: string) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) throw new DomainError(key);
  return trimmed;
};

/** Exige un número válido mayor o igual a un mínimo. */
export const requireNumber = (
  value: number | string | undefined,
  key: string,
  min = 0,
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) throw new DomainError(key);
  return parsed;
};

/** Compara textos sin distinguir mayúsculas ni acentos. */
export const normalizeText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const isSameText = (a: string, b: string) =>
  normalizeText(a) === normalizeText(b);
