// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mocked = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/nexora-transfer-history", () => ({
  readMultisiteSerialTimeline: mocked.load,
}));
import { MultisiteSerialHistory } from "./MultisiteSerialHistory";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Hoja de vida premium global de un IMEI", () => {
  it("muestra ciudad, documento y trayectoria de traslado real", async () => {
    mocked.load.mockResolvedValueOnce({
      ready: true,
      events: [{
        id: "event-1", transferId: "t1", documentCode: "TRA-001",
        createdAt: "2026-11-01T10:00:00Z", type: "despachado",
        title: "Despachado · En tránsito",
        description: "Salió de Bodega Principal · Ciudad A rumbo a Bodega Regional · Ciudad B.",
        origin: "Bodega Principal · Ciudad A",
        destination: "Bodega Regional · Ciudad B",
        status: "en_transito",
      }],
    });
    render(<MultisiteSerialHistory unitId="unit-1" />);
    await waitFor(() => expect(screen.getByText("Recorrido del IMEI entre ciudades")).toBeTruthy());
    expect(screen.getByText(/Bodega Principal · Ciudad A/)).toBeTruthy();
    expect(screen.getByText(/Documento TRA-001/)).toBeTruthy();
    expect(mocked.load).toHaveBeenCalledWith("unit-1");
  });

  it("no modifica el historial legacy si la base multisede no está migrada", async () => {
    mocked.load.mockResolvedValueOnce({ ready: false, events: [] });
    render(<MultisiteSerialHistory unitId="unit-1" />);
    await waitFor(() => expect(mocked.load).toHaveBeenCalledOnce());
    expect(screen.queryByText("Recorrido del IMEI entre ciudades")).toBeNull();
  });

  it("una falla de consulta informa sin bloquear la ficha principal", async () => {
    mocked.load.mockRejectedValueOnce(new Error("network"));
    render(<MultisiteSerialHistory unitId="unit-1" />);
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    expect(screen.getByText(/La información principal del serial sigue disponible/)).toBeTruthy();
  });
});
