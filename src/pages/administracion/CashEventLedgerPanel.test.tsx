// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from "vitest";
import { cleanup,render,screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("@/lib/nexora-cash-event-ledger",async(importOriginal)=>{
  const module=await importOriginal<typeof import("@/lib/nexora-cash-event-ledger")>();
  return {...module,fetchCashEventLedger:vi.fn(async(from:string,to:string,page:number)=>({
    scope:"cash_events_admin_only" as const,timezone:"America/Bogota" as const,
    from,to,siteId:null,page,pageSize:25,total:0,items:[],
  }))};
});
import { CashEventLedgerPanel } from "./CashEventLedgerPanel";
afterEach(cleanup);
describe("Nexora · bitácora de caja en Auditoría",()=>{
  it("consulta bajo demanda sin generar operaciones ficticias",async()=>{
    const user=userEvent.setup();
    render(<CashEventLedgerPanel/>);
    expect(screen.queryByRole("list",{name:"Cronología de acciones de caja"})).toBeNull();
    await user.click(screen.getByRole("button",{name:"Ver bitácora de caja"}));
    expect(await screen.findByText(/No hay eventos reales de caja en este período/)).toBeTruthy();
    expect(screen.getByText(/0 eventos confirmados/)).toBeTruthy();
  });
  it("mantiene tema claro/oscuro y no permite modificar caja",async()=>{
    const user=userEvent.setup();
    const {container}=render(<CashEventLedgerPanel/>);
    expect(container.firstElementChild?.className).toContain("bg-card");
    expect(container.querySelector(".dark\\:from-slate-950")).not.toBeNull();
    await user.click(screen.getByRole("button",{name:"Ver bitácora de caja"}));
    expect(screen.queryByRole("button",{name:/abrir caja|cerrar caja|vender|registrar gasto/i})).toBeNull();
  });
});
