// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OriginReturnChecklist } from "./OriginReturnChecklist";

const units = [
  { unitId: "unit-1", serial: "350000000000001" },
  { unitId: "unit-2", serial: "350000000000002" },
  { unitId: "unit-3", serial: "350000000000003" },
];

afterEach(cleanup);

const setup = (onConfirm = vi.fn(async () => {})) => {
  render(
    <OriginReturnChecklist
      returnId="return-1"
      returnCode="RET-0001"
      warehouseName="Bodega Principal"
      units={units}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
};

describe("Revisión del retorno en la bodega emisora", () => {
  it("escanea equipos encontrados sin contar seriales duplicados", async () => {
    const user = userEvent.setup();
    setup();
    const scan = screen.getByLabelText("Escaneo de devolución");
    await user.type(scan, units[0].serial + "{Enter}");
    expect(screen.getByText("IMEI 350000000000001 verificado físicamente.")).toBeTruthy();
    await user.type(scan, units[0].serial + "{Enter}");
    expect(screen.getByText("Este IMEI ya fue marcado como encontrado.")).toBeTruthy();
    expect(screen.getByText("Faltan 2 IMEI por verificar.")).toBeTruthy();
    await user.type(scan, "999999999999999{Enter}");
    expect(screen.getByText("Este IMEI no forma parte de la devolución.")).toBeTruthy();
  });

  it("con tres pendientes registra dos encontrados y uno con incidencia", async () => {
    const user = userEvent.setup();
    const onConfirm = setup();
    const scan = screen.getByLabelText("Escaneo de devolución");
    await user.type(scan, units[0].serial + "{Enter}");
    await user.type(scan, units[1].serial + "{Enter}");
    const third = screen.getByRole("group", { name: "Verificar devolución IMEI 350000000000003" });
    await user.click(within(third).getByRole("button", { name: "No encontrado" }));
    const confirm = screen.getByRole("button", { name: "Confirmar acta de devolución" });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    await user.type(screen.getByLabelText("Observación obligatoria de incidencia"), "No llegó a bodega");
    expect(confirm.hasAttribute("disabled")).toBe(false);
    await user.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith([
      { unitId: "unit-1", found: true, observation: "" },
      { unitId: "unit-2", found: true, observation: "" },
      { unitId: "unit-3", found: false, observation: "No llegó a bodega" },
    ]);
    await waitFor(() => expect(confirm.hasAttribute("disabled")).toBe(true));
    expect(screen.getByText("Acta confirmada.")).toBeTruthy();
  });

  it("ante error de conexión mantiene la revisión para consulta y reintento", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn()
      .mockRejectedValueOnce(new Error("Conexión perdida"))
      .mockResolvedValueOnce(undefined);
    setup(onConfirm);
    const scan = screen.getByLabelText("Escaneo de devolución");
    for (const unit of units) await user.type(scan, unit.serial + "{Enter}");
    const confirm = screen.getByRole("button", { name: "Confirmar acta de devolución" });
    await user.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(confirm.hasAttribute("disabled")).toBe(false);
    await user.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(confirm.hasAttribute("disabled")).toBe(true));
  });
});
