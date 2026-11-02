// @vitest-environment jsdom
import { afterEach,describe,expect,it,vi } from "vitest";
import { cleanup,render,screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const id="123e4567-e89b-12d3-a456-426614174000";
vi.mock("@/lib/nexora-imei-timeline",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@/lib/nexora-imei-timeline")>();
  return {...original,fetchMultisiteImeiTimeline:vi.fn(async()=>({
    scope:"multisite_confirmed_only",unitId:id,serial:"000123456789012",
    page:1,pageSize:25,total:1,
    items:[{
      eventId:"transfer:t1:received",eventType:"transfer_received",
      eventAt:"2026-11-02T14:00:00.000Z",
      description:"Recepción física de este IMEI confirmada en destino",
      originSite:"Bodega",destinationSite:"Local Centro",
      reference:"Traslado #1",unitState:"received",
    }],
  }))};
});

import { MultisiteImeiHistory } from "./MultisiteImeiHistory";

afterEach(cleanup);
describe("Hoja de vida · vista multisede",()=>{
  it("muestra solo la recepción realmente confirmada con sus sedes",async()=>{
    render(<MultisiteImeiHistory unitId={id} serial="000123456789012" receivedAt="2026-11-01T10:00:00.000Z" legacyTimeline={[]} />);
    expect(await screen.findByText("Recepción física de este IMEI confirmada en destino")).toBeTruthy();
    expect(screen.getByText("Recepción confirmada")).toBeTruthy();
    expect(screen.getByText(/Traslado #1/)).toBeTruthy();
    expect(screen.getByText(/Bodega/)).toBeTruthy();
    expect(screen.queryByRole("button",{name:/vender|trasladar|eliminar/i})).toBeNull();
  });
  it("mantiene la superficie premium y la actualización sin modificar datos",async()=>{
    const user=userEvent.setup();
    const {container}=render(<MultisiteImeiHistory unitId={id} serial="000123456789012" receivedAt="2026-11-01T10:00:00.000Z" legacyTimeline={[]} />);
    expect(container.firstElementChild?.className).toContain("bg-card");
    expect(container.querySelector(".dark\\:from-slate-950")).not.toBeNull();
    const button=await screen.findByRole("button",{name:"Actualizar"});
    await user.click(button);
    expect(await screen.findByText("Recepción física de este IMEI confirmada en destino")).toBeTruthy();
  });
});
