// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from "vitest";
import { cleanup,render,screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("@/lib/nexora-physical-scan-batch",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@/lib/nexora-physical-scan-batch")>();
  return {...original,registerPhysicalScanBatch:vi.fn(async(siteId:string,serials:string[])=>({
    scope:"physical_scan_batch" as const,siteId,registered:serials.length,
    inventoryApproved:false as const,items:serials.map(serial=>({
      observationId:"123e4567-e89b-12d3-a456-426614174000",
      unitId:"223e4567-e89b-12d3-a456-426614174000",
      siteId,serial,status:"en_bodega",checkedAt:"2026-11-02T19:00:00Z",
    })),
  }))};
});
import { registerPhysicalScanBatch } from "@/lib/nexora-physical-scan-batch";
import { PhysicalBatchScanPanel } from "./PhysicalBatchScanPanel";
afterEach(()=>{cleanup();vi.clearAllMocks();});
const site="123e4567-e89b-12d3-a456-426614174000";
describe("Nexora · panel de conteo físico en lote",()=>{
  it("exige revisión, confirmación de presencia y palabra COTEJAR antes de escribir",async()=>{
    const user=userEvent.setup(),done=vi.fn();
    render(<PhysicalBatchScanPanel siteId={site} siteName="Principal" approvalLocked={false} onCompleted={done}/>);
    await user.click(screen.getByRole("button",{name:"Abrir escáner por lote"}));
    await user.type(screen.getByLabelText("Lecturas de escáner (máximo 50)"),"123456789012345");
    await user.click(screen.getByRole("button",{name:"Revisar lecturas sin guardar"}));
    const button=screen.getByRole("button",{name:"Registrar lote físico"});
    expect(button.hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("checkbox",{name:"Confirmo presencia física de todos los IMEI"}));
    expect(button.hasAttribute("disabled")).toBe(true);
    await user.type(screen.getByLabelText("Escribe COTEJAR para confirmar el lote"),"COTEJAR");
    expect(button.hasAttribute("disabled")).toBe(false);
    await user.click(button);
    expect(await screen.findByText(/1 cotejos guardados y auditados/)).toBeTruthy();
    expect(registerPhysicalScanBatch).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledOnce();
  });
  it("bloquea lotes si la aprobación inicial está firmada",async()=>{
    const user=userEvent.setup();
    render(<PhysicalBatchScanPanel siteId={site} siteName="Principal" approvalLocked={true} onCompleted={()=>{}}/>);
    await user.click(screen.getByRole("button",{name:"Abrir escáner por lote"}));
    expect(screen.getByRole("button",{name:"Revisar lecturas sin guardar"}).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Inventario inicial ya aprobado/)).toBeTruthy();
  });
  it("mantiene contraste premium claro y oscuro",()=>{
    const {container}=render(<PhysicalBatchScanPanel siteId={site} siteName="Principal" approvalLocked={false} onCompleted={()=>{}}/>);
    expect(container.firstElementChild?.className).toContain("bg-card");
    expect(container.querySelector(".dark\\:from-slate-950")).not.toBeNull();
  });
});
