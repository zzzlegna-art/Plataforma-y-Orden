// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/nexora-reference-stock", async (importOriginal)=>{
  const original=await importOriginal<typeof import("@/lib/nexora-reference-stock")>();
  return {...original,fetchReferenceStock:vi.fn(async ()=>({
    initialApproved:false,scope:"serialized_imei_only" as const,
    page:1,pageSize:20,matched:1,
    items:[{
      productId:"product-1",name:"iPhone 13",sku:"IP13",
      total:1,physicallyVerified:0,available:0,
      unverified:1,inTransit:0,pendingReturn:0,sold:0,
      sites:[{siteId:null,siteName:"Sin sede verificada",cityName:null,
        total:1,physicallyVerified:0,available:0,
        unverified:1,inTransit:0,pendingReturn:0,sold:0}],
    }],
  }))};
});
vi.mock("sonner",()=>({toast:{error:vi.fn()}}));

import { ReferenceSitesPanel } from "./ReferenceSitesPanel";

afterEach(cleanup);

describe("Inventario · consolidado por referencia",()=>{
  it("informa al abrir la tabla que ninguna unidad está confirmada físicamente",async ()=>{
    const user=userEvent.setup();
    render(<ReferenceSitesPanel/>);
    expect(screen.queryByRole("table")).toBeNull();
    await user.click(screen.getByRole("button",{name:"Ver referencias por sede"}));
    const table=await screen.findByRole("table");
    const rows=within(table).getAllByRole("row");
    expect(rows.length).toBeGreaterThan(1);
    expect(within(table).getByText("iPhone 13")).toBeTruthy();
    expect(within(table).getByText("Sin sede verificada")).toBeTruthy();
    expect(screen.getByText(/Inventario inicial todavía sin aprobación/)).toBeTruthy();
    expect(screen.getByText(/Los repuestos controlados por cantidad aún/)).toBeTruthy();
  });
  it("presenta superficies premium claras y oscuras sin permitir ventas",async ()=>{
    const user=userEvent.setup();
    const {container}=render(<ReferenceSitesPanel/>);
    expect(container.firstElementChild?.className).toContain("bg-card");
    expect(container.querySelector(".dark\\:from-slate-950")).not.toBeNull();
    await user.click(screen.getByRole("button",{name:"Ver referencias por sede"}));
    expect(screen.queryByRole("button",{name:/vender|reservar|trasladar/i})).toBeNull();
  });
});
