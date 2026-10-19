import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { updateSettings } from "./actions/users";
import { DomainError, emptyDb } from "./db";
import { APP_CURRENCY, APP_LOCALE, formatCurrency, setAppCurrency } from "./format";
import type { Actor } from "./types";

const admin: Actor = { id: "admin-1", email: "admin@example.test", fullName: "Admin", role: "admin" };

const currencyMigration = readFileSync(
  new URL("../../supabase/migrations/20261019012454_default_currency_cop.sql", import.meta.url),
  "utf8",
).toLowerCase();

afterEach(() => setAppCurrency(APP_CURRENCY));

describe("currency formatting", () => {
  it("defaults to Colombian pesos and Colombian separators", () => {
    expect(APP_CURRENCY).toBe("COP");
    expect(APP_LOCALE).toBe("es-CO");
    expect(formatCurrency(1234)).toContain("$");
    expect(formatCurrency(1234)).toContain("1.234");
  });

  it("sets COP as the database default for new settings rows", () => {
    expect(currencyMigration).toContain("alter table public.bodega_settings alter column currency set default 'cop'");
  });

  it("uses the currency saved in settings", () => {
    setAppCurrency("MXN");
    expect(formatCurrency(1234)).toContain("MXN");
    setAppCurrency("COP");
    expect(formatCurrency(1234)).toContain("$");
  });

  it("falls back to the default currency if the code is malformed", () => {
    setAppCurrency("US");
    expect(formatCurrency(1234)).toContain("$");
  });
});

describe("updateSettings currency validation", () => {
  it("normalizes a three-letter currency code to uppercase", () => {
    const db = emptyDb();
    updateSettings(db, admin, { companyName: "Nexora", currency: "cop" });
    expect(db.settings.currency).toBe("COP");
  });

  it("rejects malformed currency codes before changing settings", () => {
    const db = emptyDb();
    const originalName = db.settings.companyName;
    expect(() => updateSettings(db, admin, { companyName: "Cambio", currency: "US" })).toThrow(DomainError);
    expect(db.settings.companyName).toBe(originalName);
  });
});
