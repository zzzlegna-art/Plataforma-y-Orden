// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/nexora-imei-directory", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/nexora-imei-directory")>();
  return {
    ...original,
    fetchImeiDirectory: vi.fn(async () => ({
      initialApproved: true,
      summary: {sinConciliar:0,enSede:1,enTransito:0,retornoPendiente:0,vendidos:0,total:1},
      page:1,pageSize:25,matched:1,
      items:[{
        unitId:"unit-1",serial:"000012345678901",productName:"iPhone 13",
        sku:"IP13",unitStatus:"en_bodega",custodyState:"en_sede",
        historicalLocation:"Bodega 6A",committedOrder:true,
      }],
    })),
  };
});

import { ImeiSedesPanel } from "./ImeiSedesPanel";
afterEach(cleanup);

describe("Inventario · ficha de serial",()=>{
  it("consulta seriales, muestra la bodega principal y conserva el vínculo con pedidos",async()=>{
    const user=userEvent.setup();
    render(<MemoryRouter><ImeiSedesPanel/></MemoryRouter>);
    await user.click(screen.getByRole("button",{name:"Consultar seriales"}));
    await user.click(await screen.findByRole("button",{name:"Abrir ficha del IMEI 000012345678901"}));
    const dialog=screen.getByRole("dialog");
    expect(within(dialog).getByText("Ficha del serial")).toBeTruthy();
    expect(within(dialog).getByText("Bodega 6A")).toBeTruthy();
    expect(within(dialog).getByText("Asignado a un pedido")).toBeTruthy();
    expect(within(dialog).getByRole("link",{name:/Abrir hoja de vida del IMEI/}).getAttribute("href"))
      .toBe("/seriales?serial=000012345678901");
  });
  it("no ofrece acciones comerciales ni de traslado",async()=>{
    const user=userEvent.setup();
    render(<MemoryRouter><ImeiSedesPanel/></MemoryRouter>);
    await user.click(screen.getByRole("button",{name:"Consultar seriales"}));
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.queryByRole("button",{name:/vender|reservar|trasladar/i})).toBeNull();
  });
});
