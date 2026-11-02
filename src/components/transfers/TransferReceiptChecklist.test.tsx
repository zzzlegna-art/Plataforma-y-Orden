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

  it("escanear un IMEI con Enter marca recibido una sola vez y detecta seriales ajenos", async () => {
    const user = userEvent.setup();
    renderChecklist();
    const input = screen.getByLabelText("Escaneo rápido de equipos recibidos");
    await user.type(input, "350000000000001{Enter}");
    expect(screen.getByText("IMEI 350000000000001 marcado como recibido.")).toBeTruthy();
    expect(screen.getByText("1 de 3 verificados")).toBeTruthy();

    await user.type(input, "350000000000001{Enter}");
    expect(screen.getByText("Este IMEI ya estaba marcado como recibido.")).toBeTruthy();
    expect(screen.getByText("1 de 3 verificados")).toBeTruthy();

    await user.type(input, "999999999999999{Enter}");
    expect(screen.getByText("Este IMEI no está incluido en el traslado.")).toBeTruthy();
    expect(screen.getByText("1 de 3 verificados")).toBeTruthy();
  });

  it("al confirmar la recepción se bloquean nuevos escaneos y cambios manuales", async () => {
    const user = userEvent.setup();
    const onConfirm = renderChecklist();
    const input = screen.getByLabelText("Escaneo rápido de equipos recibidos");
    for (const unit of dispatched) {
      await user.type(input, unit.serial + "{Enter}");
    }
    expect(screen.getByText("3 de 3 verificados")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Confirmar recepción/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(input.hasAttribute("disabled")).toBe(true));
    expect(screen.getByRole("button", { name: "Marcar recibido" }).hasAttribute("disabled")).toBe(true);
    const unit = screen.getByRole("group", { name: "Estado del IMEI 350000000000001" });
    expect(within(unit).getByRole("button", { name: "No llegó" }).hasAttribute("disabled")).toBe(true);
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
