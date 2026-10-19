import { afterEach, describe, expect, it } from "vitest";

import { updateSettings } from "./actions/users";
import { DomainError, emptyDb } from "./db";
import { APP_CURRENCY, APP_LOCALE, formatCurrency, setAppCurrency } from "./format";
import type { Actor } from "./types";

const admin: Actor = { id: "admin-1", email: "admin@example.test", fullName: "Admin", role: "admin" };

afterEach(() => setAppCurrency(APP_CURRENCY));

describe("currency formatting", () => {
  it("defaults to Colombian pesos and Colombian separators", () => {
    expect(APP_CURRENCY).toBe("COP");
    expect(APP_LOCALE).toBe("es-CO");
    expect(formatCurrency(1234)).toContain("$");
    expect(formatCurrency(1234)).toContain("1.234");
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
    updateSettings(db, admin, { companyName: "Bodega", currency: "cop" });
    expect(db.settings.currency).toBe("COP");
  });

  it("rejects malformed currency codes before changing settings", () => {
    const db = emptyDb();
    const originalName = db.settings.companyName;
    expect(() => updateSettings(db, admin, { companyName: "Cambio", currency: "US" })).toThrow(DomainError);
    expect(db.settings.companyName).toBe(originalName);
  });
});
