// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks=vi.hoisted(()=>({
  localStatus:vi.fn(),
  approveLocal:vi.fn(),
  cashLimits:vi.fn(),
  saveLimits:vi.fn(),
}));
vi.mock("@/lib/nexora-v49-controls",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@/lib/nexora-v49-controls")>();
  return {...original,
    getLocalInitialStatus:mocks.localStatus,
    approveLocalInitial:mocks.approveLocal,
    getCashLimits:mocks.cashLimits,
    saveCashLimits:mocks.saveLimits,
  };
});
import { NexoraCashLimitControls,NexoraLocalInitialControls } from "./NexoraV49Controls";

afterEach(()=>{cleanup();vi.clearAllMocks();});
const siteId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("Nexora V4.9 · interfaz de aprobación por local",()=>{
  it("no firma automáticamente y exige acta global",async()=>{
    mocks.localStatus.mockResolvedValue([{
      siteId,siteName:"Local Prueba",initialCount:0,
      globalApproved:false,approved:false,approvedAt:null,approvedCount:null,
    }]);
    render(<NexoraLocalInitialControls/>);
    expect(await screen.findByText("Local Prueba")).toBeTruthy();
    expect(screen.getByText(/Falta la aprobación global del inventario/)).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Revisar y firmar acta"})).toBeNull();
    expect(mocks.approveLocal).not.toHaveBeenCalled();
  });

  it("exige confirmación APROBAR y nota válida antes de llamar a la RPC",async()=>{
    mocks.localStatus.mockResolvedValue([{
      siteId,siteName:"Local Prueba",initialCount:0,
      globalApproved:true,approved:false,approvedAt:null,approvedCount:null,
    }]);
    mocks.approveLocal.mockResolvedValue(undefined);
    const user=userEvent.setup();
    render(<NexoraLocalInitialControls/>);
    await screen.findByText("Local Prueba");
    await user.click(screen.getByRole("button",{name:"Revisar y firmar acta"}));
    const firmar=screen.getByRole("button",{name:"Firmar acta"});
    expect(firmar.hasAttribute("disabled")).toBe(true);
    expect(mocks.approveLocal).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Observación de verificación/),
      "Se comprobó el conteo físico sin IMEI iniciales");
    await user.type(screen.getByLabelText("Escribe APROBAR"),"APROBAR");
    expect(firmar.hasAttribute("disabled")).toBe(false);
    await user.click(firmar);
    expect(mocks.approveLocal).toHaveBeenCalledWith(siteId,
      "Se comprobó el conteo físico sin IMEI iniciales","APROBAR");
  });
});

describe("Nexora V4.9 · interfaz de límites monetarios",()=>{
  it("no inventa importes ni los guarda al consultar",async()=>{
    mocks.cashLimits.mockResolvedValue([{
      siteId,siteName:"Local Prueba",configured:false,maxPerExpense:null,
      maxPerDay:null,updatedAt:null,
    }]);
    const user=userEvent.setup();
    render(<NexoraCashLimitControls/>);
    const label=await screen.findByText("Local Prueba");
    const card=label.closest("article");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByLabelText("Máximo por gasto (COP)")).toHaveProperty("value","");
    expect(within(card as HTMLElement).getByLabelText("Máximo total por día (COP)")).toHaveProperty("value","");
    expect(mocks.saveLimits).not.toHaveBeenCalled();
    await user.click(within(card as HTMLElement).getByRole("button",{name:"Guardar topes"}));
    expect(mocks.saveLimits).not.toHaveBeenCalled();
  });

  it("permite fijar cero como bloqueo explícito y remite el sitio correcto",async()=>{
    mocks.cashLimits.mockResolvedValue([{
      siteId,siteName:"Local Prueba",configured:false,maxPerExpense:null,
      maxPerDay:null,updatedAt:null,
    }]);
    mocks.saveLimits.mockResolvedValue(undefined);
    const user=userEvent.setup();
    render(<NexoraCashLimitControls/>);
    const label=await screen.findByText("Local Prueba");
    const card=label.closest("article");
    expect(card).not.toBeNull();
    await user.type(within(card as HTMLElement).getByLabelText("Máximo por gasto (COP)"),"0");
    await user.type(within(card as HTMLElement).getByLabelText("Máximo total por día (COP)"),"0");
    await user.click(within(card as HTMLElement).getByRole("button",{name:"Guardar topes"}));
    expect(mocks.saveLimits).toHaveBeenCalledWith(siteId,0,0);
  });
});
