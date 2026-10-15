/** Acciones sobre clientes mayoristas. */

import { createId, DomainError, logAudit, nowIso } from "../db";
import type { Actor, Customer, Db } from "../types";
import { requirePermission, requireText } from "./guards";

export interface CustomerInput {
  name: string;
  taxId?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  isActive?: boolean;
  /** Qué le puede vender: celulares/tablets/relojes, repuestos, o ambos. */
  categoriaMayorista?: "celulares" | "repuestos" | "ambos";
}

export const createCustomer = (
  db: Db,
  actor: Actor,
  input: CustomerInput,
): Customer => {
  requirePermission(actor, "customers.manage");
  const customer: Customer = {
    id: createId(),
    name: requireText(input.name, "errors.customerNameRequired"),
    taxId: input.taxId?.trim() || undefined,
    contactName: input.contactName?.trim() || undefined,
    email: input.email?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    address: input.address?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    isActive: input.isActive ?? true,
    // Todo cliente hoy es mayorista (Pedidos es siempre "a clientes mayoristas"); lo que sí
    // varía es qué le puede vender, y eso es lo que se pide al crearlo.
    tipo: "mayorista",
    categoriaMayorista: input.categoriaMayorista ?? "ambos",
    createdAt: nowIso(),
  };
  db.customers.push(customer);
  logAudit(db, actor, {
    action: "create",
    entity: "customer",
    entityId: customer.id,
    details: customer.name,
  });
  return customer;
};

export const updateCustomer = (
  db: Db,
  actor: Actor,
  input: CustomerInput & { id: string },
): Customer => {
  requirePermission(actor, "customers.manage");
  const customer = db.customers.find((item) => item.id === input.id);
  if (!customer) throw new DomainError("errors.notFound");
  customer.name = requireText(input.name, "errors.customerNameRequired");
  customer.taxId = input.taxId?.trim() || undefined;
  customer.contactName = input.contactName?.trim() || undefined;
  customer.email = input.email?.trim() || undefined;
  customer.phone = input.phone?.trim() || undefined;
  customer.address = input.address?.trim() || undefined;
  customer.notes = input.notes?.trim() || undefined;
  customer.isActive = input.isActive ?? customer.isActive;
  customer.categoriaMayorista = input.categoriaMayorista ?? customer.categoriaMayorista;
  logAudit(db, actor, {
    action: "update",
    entity: "customer",
    entityId: customer.id,
    details: customer.name,
  });
  return customer;
};

export const setCustomerActive = (
  db: Db,
  actor: Actor,
  input: { id: string; isActive: boolean },
) => {
  requirePermission(actor, "customers.manage");
  const customer = db.customers.find((item) => item.id === input.id);
  if (!customer) throw new DomainError("errors.notFound");
  customer.isActive = input.isActive;
  logAudit(db, actor, {
    action: "update",
    entity: "customer",
    entityId: customer.id,
    details: `${customer.name} · ${input.isActive ? "activo" : "inactivo"}`,
  });
  return customer;
};
