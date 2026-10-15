import { describe, expect, it } from "vitest";

import { tabDeEstado, tabDesdeParametro } from "./warranty-tabs";

describe("warranty-tabs", () => {
  it("lee la pestaña de la dirección y usa «recibir» si falta o es inválida", () => {
    expect(tabDesdeParametro("recibidos")).toBe("recibidos");
    expect(tabDesdeParametro("historial")).toBe("historial");
    expect(tabDesdeParametro(null)).toBe("recibir");
    expect(tabDesdeParametro("cualquier-cosa")).toBe("recibir");
  });
  it("cada estado vuelve a su lista", () => {
    expect(tabDeEstado("recibido")).toBe("recibidos");
    expect(tabDeEstado("en_servicio_tecnico")).toBe("servicio");
    expect(tabDeEstado("reenvio_pendiente")).toBe("reenvio");
    expect(tabDeEstado("entregado")).toBe("historial");
    expect(tabDeEstado("devuelto")).toBe("historial");
  });
});
