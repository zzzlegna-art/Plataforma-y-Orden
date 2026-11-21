import { describe, expect, it } from "vitest";

import { updateSettings } from "./actions/users";
import { emptyDb } from "./db";
import type { Actor } from "./types";

const admin: Actor = { id: "admin-1", email: "admin@example.test", fullName: "Admin", role: "admin" };

describe("company settings", () => {
  it("updates the company name without financial configuration", () => {
    const db = emptyDb();
    updateSettings(db, admin, { companyName: "Bodega 6A" });
    expect(db.settings.companyName).toBe("Bodega 6A");
  });
});
