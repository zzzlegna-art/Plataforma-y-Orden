// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from "vitest";
import { cleanup,render,screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("@/hooks/use-store",()=>({useStore:()=>({db:{units:[],products:[],receptions:[]}})}));
vi.mock("@/lib/nexora-cost-evidence",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@/lib/nexora-cost-evidence")>();
  return {...original,fetchCostEvidenceReport:vi.fn(async()=>({
    scope:"cost_recovery_evidence_only" as const,
    snapshotAt:"2026-11-02T21:00:00Z",
    eligible:2758,withoutCost:2758,withCost:0,receipts:1,
    items:[{
      receptionId:"11111111-1111-4111-8111-111111111111",
      receptionCode:"REC-00001",receiptReference:null,receiptStatus:"confirmada",
      receivedAt:"2026-10-27T09:00:00Z",supplierName:null,
      eligible:2758,withoutCost:2758,withCost:0,referencesCount:16,
    }],
  }))};
});
import { CostEvidencePanel } from "./CostEvidencePanel";
afterEach(cleanup);
describe("Nexora · diagnóstico de facturas de costo",()=>{
  it("consulta bajo demanda y muestra evidencia real sin permitir cambios",async()=>{
    const user=userEvent.setup();
    render(<CostEvidencePanel/>);
    expect(screen.queryByText("REC-00001")).toBeNull();
    await user.click(screen.getByRole("button",{name:"Consultar recepciones"}));
    expect(await screen.findByText("REC-00001")).toBeTruthy();
    expect(screen.getByText(/Sin proveedor identificado/)).toBeTruthy();
    expect(screen.getByRole("button",{name:"Descargar planilla de facturas CSV"}).hasAttribute("disabled")).toBe(false);
    expect(screen.queryByRole("button",{name:/registrar costo|aprobar costo|vender/i})).toBeNull();
  });
  it("mantiene el estilo premium claro y oscuro",()=>{
    const {container}=render(<CostEvidencePanel/>);
    expect(container.firstElementChild?.className).toContain("bg-card");
    expect(container.querySelector(".dark\\:from-amber-950\\/40")).not.toBeNull();
  });
});
