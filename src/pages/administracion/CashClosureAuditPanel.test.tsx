// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from "vitest";
import { cleanup,render,screen,within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("@/lib/nexora-cash-closure-audit",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@/lib/nexora-cash-closure-audit")>();
  return {...original,fetchCashClosureAudit:vi.fn(async(from:string,to:string,_site:string|null,page:number)=>({
    scope:"admin_cash_session_audit" as const,
    timezone:"America/Bogota" as const,
    from,to,siteId:null,page,pageSize:25,total:0,items:[],
  }))};
});
import { CashClosureAuditPanel } from "./CashClosureAuditPanel";
afterEach(cleanup);
describe("Nexora · auditoría de arqueos y cierres",()=>{
  it("consulta bajo demanda sin inventar jornadas de caja",async()=>{
    const user=userEvent.setup();
    render(<CashClosureAuditPanel/>);
    expect(screen.queryByRole("table")).toBeNull();
    await user.click(screen.getByRole("button",{name:"Ver auditoría"}));
    const table=await screen.findByRole("table");
    expect(within(table).getByText("Reaperturas")).toBeTruthy();
    expect(screen.getByText(/No existen jornadas de caja reales en este período/)).toBeTruthy();
    expect(screen.getByText(/0 jornadas en el período/)).toBeTruthy();
  });
  it("mantiene contraste premium claro/oscuro y no ofrece operaciones monetarias",async()=>{
    const user=userEvent.setup();
    const {container}=render(<CashClosureAuditPanel/>);
    expect(container.firstElementChild?.className).toContain("bg-card");
    expect(container.querySelector(".dark\\:from-slate-950")).not.toBeNull();
    await user.click(screen.getByRole("button",{name:"Ver auditoría"}));
    expect(screen.queryByRole("button",{name:/abrir caja|cerrar caja|vender|reabrir caja/i})).toBeNull();
  });
});
