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
      eligible:0,excludedHistorical:395,pending:0,verified:0,
      stale:0,withoutValidCost:0,rows:[],
    })),
  };
});
import { InitialCountWorklistPanel } from "./InitialCountWorklistPanel";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe("Nexora · planilla de conteo en Administración",()=>{
  it("consulta bajo demanda y no inventa unidades cuando está vacía",async()=>{
    const user=userEvent.setup();
    const create=vi.fn(()=> "blob:planilla-test");
    const revoke=vi.fn();
    vi.stubGlobal("URL",{...URL,createObjectURL:create,revokeObjectURL:revoke});
    const anchor=vi.spyOn(HTMLAnchorElement.prototype,"click").mockImplementation(()=>{});
    render(<InitialCountWorklistPanel/>);
    expect(screen.getByRole("button",{name:"Descargar planilla CSV"})).toBeTruthy();
    await user.click(screen.getByRole("button",{name:"Descargar planilla CSV"}));
    await waitFor(()=>expect(screen.getByText(/395 registros históricos no elegibles excluidos/)).toBeTruthy());
    expect(create).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:planilla-test");
    expect(anchor).toHaveBeenCalledTimes(1);
    anchor.mockRestore();
  });
  it("está sincronizada visualmente en claro/oscuro y sin autorizaciones operativas",()=>{
    const {container}=render(<InitialCountWorklistPanel/>);
    expect(container.firstElementChild?.className).toContain("bg-card");
    expect(container.querySelector(".dark\\:from-slate-950")).not.toBeNull();
    expect(screen.queryByRole("button",{name:/aprobar inventario|vender|trasladar/i})).toBeNull();
    expect(screen.getByText(/NO una asignación de mercancía/)).toBeTruthy();
  });
});
