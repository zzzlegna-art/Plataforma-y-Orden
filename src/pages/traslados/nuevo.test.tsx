// @vitest-environment jsdom
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { cleanup,render,screen,waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mocks=vi.hoisted(()=>({
  catalog:vi.fn(),units:vi.fn(),dispatch:vi.fn(),verify:vi.fn(),
}));
vi.mock("@/lib/nexora-transfer-dispatch",async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/nexora-transfer-dispatch")>()),
  loadDispatchCatalog:mocks.catalog,
  loadDispatchSerials:mocks.units,
}));
vi.mock("@/lib/nexora-transfer-api",()=>({dispatchMultisiteTransfer:mocks.dispatch}));
vi.mock("@/lib/nexora-transfer-dispatch-check",()=>({checkDispatchOperation:mocks.verify}));
import NewTransferPilot from "./nuevo";

const site=(id:string,city_id:string,kind:string,parent_warehouse_id:string|null=null)=>({
  id,city_id,kind,parent_warehouse_id,name:id,code:id,is_active:true,
  address:null,created_at:"",created_by:null,
});
beforeEach(()=>{
  vi.stubGlobal("crypto",{randomUUID:()=> "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"});
  mocks.catalog.mockResolvedValue({
    cities:[{id:"c1",name:"Ciudad A"},{id:"c2",name:"Ciudad B"}],
    sites:[site("b1","c1","principal"),site("b2","c2","bodega"),
      site("l2","c2","local","b2"),site("l1","c1","local","b1")],
    products:[{id:"p1",name:"iPhone 13",sku:"IP13",is_active:true}],
  });
  mocks.units.mockResolvedValue([
    {id:"u1",serial:"350000000000001",product_id:"p1",color:"Azul"},
    {id:"u2",serial:"350000000000002",product_id:"p1",color:"Negro"},
  ]);
});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
const renderForm=()=>render(<MemoryRouter><NewTransferPilot /></MemoryRouter>);
const fill=async(user:ReturnType<typeof userEvent.setup>)=>{
  await waitFor(()=>expect(screen.getByLabelText("Origen físico")).toBeTruthy());
  await user.selectOptions(screen.getByLabelText("Origen físico"),"b2");
  await user.selectOptions(screen.getByLabelText("Destino permitido"),"l2");
  await user.selectOptions(screen.getByLabelText("Referencia de mercancía"),"p1");
  await waitFor(()=>expect(screen.getByText("350000000000001")).toBeTruthy());
  await user.type(screen.getByLabelText("IMEI que deseas enviar"),"350000000000001{Enter}");
  await waitFor(()=>expect(screen.getByRole("button",{name:"Quitar IMEI 350000000000001"})).toBeTruthy());
};
describe("Crear traslado multisede — IMEI por referencia",()=>{
  it("no presenta rutas directas de local a local",async()=>{
    const user=userEvent.setup();
    renderForm();
    await waitFor(()=>expect(screen.getByLabelText("Origen físico")).toBeTruthy());
    await user.selectOptions(screen.getByLabelText("Origen físico"),"l2");
    const destination=screen.getByLabelText("Destino permitido") as HTMLSelectElement;
    expect([...destination.options].some(option=>option.value==="l1")).toBe(false);
    expect([...destination.options].some(option=>option.value==="b2")).toBe(true);
    expect([...destination.options].some(option=>option.value==="b1")).toBe(false);
  });

  it("crea un único despacho por IMEI confirmado con el mismo UUID",async()=>{
    mocks.dispatch.mockResolvedValue({
      transferId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status:"en_transito",idempotent:false,dispatchedCount:1,
    });
    const user=userEvent.setup();renderForm();await fill(user);
    await user.click(screen.getByRole("button",{name:"Confirmar despacho físico"}));
    await waitFor(()=>expect(mocks.dispatch).toHaveBeenCalledWith({
      transferId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      originSiteId:"b2",destinationSiteId:"l2",unitIds:["u1"],
    }));
    expect(await screen.findByText("Despacho confirmado")).toBeTruthy();
  });

  it("una conexión perdida obliga a verificar antes de reintentar con el UUID original",async()=>{
    mocks.dispatch.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce({
      transferId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",status:"en_transito",idempotent:false,dispatchedCount:1,
    });
    mocks.verify.mockResolvedValue({result:"absent"});
    const user=userEvent.setup();renderForm();await fill(user);
    await user.click(screen.getByRole("button",{name:"Confirmar despacho físico"}));
    expect(await screen.findByRole("button",{name:"Verificar despacho en servidor"})).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Confirmar despacho físico"})).toBeNull();
    await user.click(screen.getByRole("button",{name:"Verificar despacho en servidor"}));
    expect(await screen.findByRole("button",{name:"Reintentar el mismo despacho"})).toBeTruthy();
    await user.click(screen.getByRole("button",{name:"Reintentar el mismo despacho"}));
    await waitFor(()=>expect(mocks.dispatch).toHaveBeenCalledTimes(2));
    expect(mocks.dispatch.mock.calls[0][0].transferId).toBe(mocks.dispatch.mock.calls[1][0].transferId);
  });

  it("no deja continuar si la red multisede no está creada",async()=>{
    mocks.catalog.mockRejectedValueOnce(new Error("Migración no activada"));
    renderForm();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Confirmar despacho físico"})).toBeNull();
  });
});
