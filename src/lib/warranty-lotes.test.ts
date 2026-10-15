import { describe, expect, it } from "vitest";

import { garantiasNuevasDeUsuario } from "./warranty-lotes";

const g = (id: string, status = "recibido", createdBy = "yo") => ({ id, status, createdBy });

describe("garantiasNuevasDeUsuario", () => {
  it("devuelve solo las que no se conocían, recibidas y creadas por el usuario", () => {
    const conocidas = new Set(["a"]);
    const nuevas = garantiasNuevasDeUsuario(conocidas, [g("a"), g("b"), g("c", "recibido", "otro"), g("d", "entregado")], "yo");
    expect(nuevas.map((x) => x.id)).toEqual(["b"]);
  });

  it("al abrir la pantalla nada cuenta como nuevo (todo ya es conocido)", () => {
    const lista = [g("a"), g("b")];
    expect(garantiasNuevasDeUsuario(new Set(["a", "b"]), lista, "yo")).toEqual([]);
  });

  it("sin usuario no devuelve nada", () => {
    expect(garantiasNuevasDeUsuario(new Set(), [g("a")], undefined)).toEqual([]);
  });
});
