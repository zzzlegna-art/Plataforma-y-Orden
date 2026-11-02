// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from "vitest";
import { cleanup,render,screen,waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("@/lib/nexora-initial-count-worklist",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@/lib/nexora-initial-count-worklist")>();
  return {
    ...original,
    fetchInitialCountWorklist:vi.fn(async()=>({
      scope:"initial_physical_inventory_worklist" as const,
      snapshotAt:"2026-11-02T19:00:00Z",
      eligible:2,excludedHistorical:395,pending:1,verified:0,stale:1,withoutValidCost:2,
      rows:[
        {
          unitId:"11111111-1111-4111-8111-111111111111",serial:"123456789012345",
          productName:"Celular Azul",sku:"SKU-A",legacyStatus:"en_bodega",
          condition:"nuevo",historicalLocation:null,cost:null,
          reconciliationState:"pendiente" as const,
          observedSiteId:null,observedSiteName:null,observedCityName:null,observedAt:null,
        },
        {
          unitId:"22222222-2222-4222-8222-222222222222",serial:"123456789012346",
          productName:"Celular Blanco",sku:"SKU-B",legacyStatus:"en_bodega",
          condition:"nuevo",historicalLocation:null,cost:null,
          reconciliationState:"revisar" as const,
          observedSiteId:"33333333-3333-4333-8333-333333333333",
          observedSiteName:"Principal",observedCityName:"Barranquilla",
          observedAt:"2026-11-02T19:00:00Z",
        },
      ],
    })),
  };
});
import { ReferenceReconciliationProgressPanel } from "./ReferenceReconciliationProgressPanel";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe("Nexora · tablero de conciliación por referencia",()=>{
  it("consulta a voluntad y separa los cotejos desactualizados",async()=>{
    const user=userEvent.setup();
    render(<ReferenceReconciliationProgressPanel/>);
    expect(screen.queryByText("SKU-A")).toBeNull();
    await user.click(screen.getByRole("button",{name:"Consultar avance"}));
    expect(await screen.findByText("SKU-A")).toBeTruthy();
    expect(screen.getByText("SKU-B")).toBeTruthy();
    expect(screen.getByText(/1 observaciones ya no coinciden/)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Filtrar avance de referencias"),"stale");
    expect(screen.queryByText("SKU-A")).toBeNull();
    expect(screen.getByText("SKU-B")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Filtrar avance de referencias"),"pending");
    expect(screen.getByText("SKU-A")).toBeTruthy();
    expect(screen.queryByText("SKU-B")).toBeNull();
  });
  it("exporta un resumen completo sin crear operaciones ni mostrar datos ficticios",async()=>{
    const user=userEvent.setup();
    const create=vi.fn(()=>"blob:conteo"),
      revoke=vi.fn();
    vi.stubGlobal("URL",{...URL,createObjectURL:create,revokeObjectURL:revoke});
    const click=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});
    render(<ReferenceReconciliationProgressPanel/>);
    await user.click(screen.getByRole("button",{name:"Consultar avance"}));
    await screen.findByText("SKU-A");
    await user.click(screen.getByRole("button",{name:"Exportar avance CSV"}));
    await waitFor(()=>expect(create).toHaveBeenCalledTimes(1));
    expect(revoke).toHaveBeenCalledWith("blob:conteo");
    expect(click).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button",{name:/aprobar inventario|vender|ajustar existencia/i})).toBeNull();
    click.mockRestore();
  });
  it("mantiene tema premium claro y oscuro",()=>{
    const {container}=render(<ReferenceReconciliationProgressPanel/>);
    expect(container.firstElementChild?.className).toContain("bg-card");
    expect(container.querySelector(".dark\\:from-slate-950")).not.toBeNull();
    expect(screen.getByText(/NO es un faltante comprobado/)).toBeTruthy();
  });
});
