// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/nexora-reference-stock", async (importOriginal)=>{
  const original=await importOriginal<typeof import("@/lib/nexora-reference-stock")>();
  return {...original,fetchReferenceStock:vi.fn(async()=>({
    initialApproved:true,scope:"serialized_imei_only" as const,
    page:1,pageSize:20,matched:1,
    items:[{
      productId:"product-1",name:"iPhone 13",sku:"IP13",
      total:4,physicallyVerified:2,committedOrders:1,
      unverified:1,inTransit:0,pendingReturn:0,sold:1,
    }],
  }))};
});
vi.mock("sonner",()=>({toast:{error:vi.fn()}}));

import { ReferenceSitesPanel } from "./ReferenceSitesPanel";
afterEach(cleanup);

describe("Inventario · existencias por referencia",()=>{
  it("muestra conteos consolidados sin desglose de sedes",async()=>{
    const user=userEvent.setup();
    render(<ReferenceSitesPanel/>);
    expect(screen.queryByRole("table")).toBeNull();
    await user.click(screen.getByRole("button",{name:"Consultar referencias"}));
    const table=await screen.findByRole("table");
    expect(within(table).getByText("iPhone 13")).toBeTruthy();
    expect(within(table).getByText("4")).toBeTruthy();
    expect(within(table).getByText("2")).toBeTruthy();
    expect(within(table).getByText("1")).toBeTruthy();
  });
  it("mantiene la explicación de inventario serializado y no habilita ventas",async()=>{
    const user=userEvent.setup();
    render(<ReferenceSitesPanel/>);
    await user.click(screen.getByRole("button",{name:"Consultar referencias"}));
    expect(screen.getByText(/Conteo de unidades con IMEI únicamente/)).toBeTruthy();
    expect(screen.queryByRole("button",{name:/vender|reservar|trasladar/i})).toBeNull();
  });
});
