// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TransferReceiptChecklist } from "./TransferReceiptChecklist";

const dispatched = [
  { unitId: "unit-1", serial: "350000000000001" },
  { unitId: "unit-2", serial: "350000000000002" },
  { unitId: "unit-3", serial: "350000000000003" },
];

afterEach(cleanup);

const renderChecklist = (onConfirm = vi.fn(async () => {})) => {
  render(
    <TransferReceiptChecklist
      transferCode="TRA-0001"
      originName="Bodega Central"
      destinationName="Local Norte"
      dispatched={dispatched}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
};

describe("Recepción premium de traslados por IMEI", () => {
  it("no confirma equipos sin marcar ni faltantes sin observación", async () => {
    const user = userEvent.setup();
    const confirm = renderChecklist();
    const button = screen.getByRole("button", { name: /Confirmar recepción/i });

    expect(button.hasAttribute("disabled")).toBe(true);
    const unit1 = screen.getByRole("group", { name: "Estado del IMEI 350000000000001" });
    const unit2 = screen.getByRole("group", { name: "Estado del IMEI 350000000000002" });
    const unit3 = screen.getByRole("group", { name: "Estado del IMEI 350000000000003" });

    await user.click(within(unit1).getByRole("button", { name: "Recibido" }));
    await user.click(within(unit2).getByRole("button", { name: "Recibido" }));
    await user.click(within(unit3).getByRole("button", { name: "No llegó" }));
    expect(screen.getByText(/Faltan 1 observaciones/i)).toBeTruthy();
    expect(button.hasAttribute("disabled")).toBe(true);

    await user.type(screen.getByLabelText("Observación obligatoria"), "El equipo no llegó.");
    expect(button.hasAttribute("disabled")).toBe(false);
    await user.click(button);

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledWith({
      dispatchedCount: 3,
      receivedCount: 2,
      missingCount: 1,
      receivedUnitIds: ["unit-1", "unit-2"],
      pendingOriginReturn: [{
        unitId: "unit-3",
        serial: "350000000000003",
        observation: "El equipo no llegó.",
      }],
    });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("si el servidor falla mantiene marcas y permite reintentar sin perder datos", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn()
      .mockRejectedValueOnce(new Error("La conexión falló"))
      .mockResolvedValueOnce(undefined);
    renderChecklist(onConfirm);

    for (const unit of dispatched) {
      const group = screen.getByRole("group", { name: `Estado del IMEI ${unit.serial}` });
      await user.click(within(group).getByRole("button", { name: "Recibido" }));
    }
    const button = screen.getByRole("button", { name: /Confirmar recepción/i });
    await user.click(button);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(button.hasAttribute("disabled")).toBe(false);

    await user.click(button);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(true));
  });
});
