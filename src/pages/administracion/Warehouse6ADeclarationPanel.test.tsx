// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from "vitest";
import { cleanup,render,screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks=vi.hoisted(()=>({
  preflight:vi.fn(),
  certify:vi.fn(),
}));
vi.mock("@/lib/nexora-warehouse-6a-opening",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@/lib/nexora-warehouse-6a-opening")>();
  return {...original,
    fetchWarehouse6APreflight:mocks.preflight,
    certifyWarehouse6A:mocks.certify,
  };
});
import { Warehouse6ADeclarationPanel } from "./Warehouse6ADeclarationPanel";
afterEach(()=>{cleanup();vi.clearAllMocks();});
const report=()=>({
  scope:"warehouse_6a_declaration_preflight" as const,
  siteId:"cf03b83a-a23f-4bd2-a778-2c071fa9df2e",
  siteName:"Bodega 6A",eligible:2758,soldHistorical:395,otherHistorical:0,
  withoutValidCost:2758,activeImeiScans:0,mappedUnits:0,priorApprovals:0,
  custodyRows:0,inFlightTransferLines:0,inventoryFingerprint:"e".repeat(32),
  canCertify:true,snapshotAt:"2026-11-02T22:00:00Z",
  physicalPresenceIndependentlyVerified:false as const,
});
describe("Nexora · firma excepcional de Bodega 6A",()=>{
  it("no firma automáticamente al consultar ni sin confirmación",async()=>{
    mocks.preflight.mockResolvedValue(report());
    const user=userEvent.setup();
    render(<Warehouse6ADeclarationPanel alreadyApproved={false} onApproved={()=>{}}/>);
    expect(mocks.preflight).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button",{name:"Revisar apertura excepcional"}));
    expect(await screen.findByText(/Huella del corte/)).toBeTruthy();
    expect(screen.getAllByText(/2.758/).length).toBeGreaterThan(0);
    expect(mocks.certify).not.toHaveBeenCalled();
    expect(screen.getByRole("button",{name:"Firmar acta 6A"}).hasAttribute("disabled")).toBe(true);
  });
  it("conserva bloqueos y no propone firmar si la sede no coincide",async()=>{
    mocks.preflight.mockResolvedValue({...report(),canCertify:false,
      priorApprovals:1});
    const user=userEvent.setup();
    render(<Warehouse6ADeclarationPanel alreadyApproved={false} onApproved={()=>{}}/>);
    await user.click(screen.getByRole("button",{name:"Revisar apertura excepcional"}));
    expect(await screen.findByText(/Certificación bloqueada/)).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Firmar acta 6A"})).toBeNull();
  });
  it("esconde completamente el formulario después de una aprobación previa",()=>{
    render(<Warehouse6ADeclarationPanel alreadyApproved={true} onApproved={()=>{}}/>);
    expect(screen.queryByRole("button",{name:"Revisar apertura excepcional"})).toBeNull();
  });
  it("incluye diseño premium compatible con ambos temas",()=>{
    const {container}=render(<Warehouse6ADeclarationPanel alreadyApproved={false} onApproved={()=>{}}/>);
    expect(container.querySelector(".dark\\:from-indigo-950\\/40")).not.toBeNull();
    expect(container.firstElementChild?.className).toContain("bg-card");
  });
});
