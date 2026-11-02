// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from "vitest";
import { cleanup,render,screen,within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/nexora-retail-site-finance",async(importOriginal)=>{
  const actual=await importOriginal<typeof import("@/lib/nexora-retail-site-finance")>();
  return {...actual,fetchRetailSiteFinancialReport:vi.fn(async(from:string,to:string)=>({
    scope:"retail_only_confirmed" as const,timezone:"America/Bogota" as const,
    from,to,stores:[],
  }))};
});
import { RetailSiteFinancePanel } from "./RetailSiteFinancePanel";

afterEach(cleanup);
describe("Nexora · informe histórico por local",()=>{
  it("es una sección bajo demanda y no inventa ganancias sin locales",async()=>{
    const user=userEvent.setup();
    render(<RetailSiteFinancePanel/>);
    expect(screen.queryByRole("table")).toBeNull();
    await user.click(screen.getByRole("button",{name:"Ver informe histórico"}));
    const table=await screen.findByRole("table");
    expect(within(table).getByText("Ciudad / local")).toBeTruthy();
    expect(screen.getByText(/Aún no hay locales comerciales registrados/)).toBeTruthy();
    expect(screen.getAllByText(/no es utilidad neta/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/0 IMEI vendidos/)).toBeTruthy();
    expect(screen.getByRole("button",{name:"Descargar CSV de sedes"}).hasAttribute("disabled")).toBe(false);
  });
  it("mantiene los dos temas premium sin controles de caja o ventas",async()=>{
    const user=userEvent.setup();
    const {container}=render(<RetailSiteFinancePanel/>);
    expect(container.firstElementChild?.className).toContain("bg-card");
    expect(container.querySelector(".dark\\:from-slate-950")).not.toBeNull();
    await user.click(screen.getByRole("button",{name:"Ver informe histórico"}));
    expect(screen.queryByRole("button",{name:/vender|abrir caja|cerrar caja|editar/i})).toBeNull();
  });
});
