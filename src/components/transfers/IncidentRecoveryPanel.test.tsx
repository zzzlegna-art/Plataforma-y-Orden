// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IncidentRecoveryPanel } from "./IncidentRecoveryPanel";

const sample = [
  {unitId:"unit-1",serial:"350000000000001",receiptStatus:"no_llego" as const,
    observation:"Nunca llegó",isOpen:true},
  {unitId:"unit-2",serial:"350000000000002",receiptStatus:"no_llego" as const,
    observation:"No está en la caja",isOpen:true},
  {unitId:"unit-3",serial:"350000000000003",receiptStatus:"recibido" as const,
    observation:"",isOpen:false},
];
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("Recuperación auditada de faltantes", () => {
  it("solo permite confirmar un IMEI que tenga incidencia abierta y nota", async () => {
    const user=userEvent.setup();
    const onRecover=vi.fn(async () => {});
    render(<IncidentRecoveryPanel units={sample} onRecover={onRecover} />);
    const input=screen.getByLabelText("IMEI encontrado físicamente");
    const note=screen.getByLabelText("Observación obligatoria");
    const button=screen.getByRole("button",{name:"Confirmar IMEI recuperado"});
    expect(button.hasAttribute("disabled")).toBe(true);
    await user.type(input,"350000000000003");
    await user.type(note,"Equipo encontrado en conteo");
    expect(button.hasAttribute("disabled")).toBe(true);
    await user.clear(input);
    await user.type(input,"350000000000002");
    expect(button.hasAttribute("disabled")).toBe(false);
    await user.click(button);
    await waitFor(() => expect(onRecover).toHaveBeenCalledWith(
      "unit-2","Equipo encontrado en conteo",
    ));
    expect(onRecover).toHaveBeenCalledTimes(1);
  });

  it("mantiene los datos del IMEI cuando el servidor rechaza la confirmación", async () => {
    const user=userEvent.setup();
    const onRecover=vi.fn(async () => { throw new Error("Sin conexión"); });
    render(<IncidentRecoveryPanel units={sample} onRecover={onRecover} />);
    await user.type(screen.getByLabelText("IMEI encontrado físicamente"),"350000000000001");
    await user.type(screen.getByLabelText("Observación obligatoria"),"Equipo encontrado");
    await user.click(screen.getByRole("button",{name:"Confirmar IMEI recuperado"}));
    await waitFor(() => expect(onRecover).toHaveBeenCalledTimes(1));
    expect((screen.getByLabelText("IMEI encontrado físicamente") as HTMLInputElement).value)
      .toBe("350000000000001");
    expect((screen.getByLabelText("Observación obligatoria") as HTMLInputElement).value)
      .toBe("Equipo encontrado");
  });

  it("oculta recuperación cuando todas las incidencias están cerradas", () => {
    render(<IncidentRecoveryPanel units={sample.filter(unit => !unit.isOpen)} onRecover={vi.fn()} />);
    expect(screen.queryByLabelText("Recuperar IMEI encontrado")).toBeNull();
  });
});
