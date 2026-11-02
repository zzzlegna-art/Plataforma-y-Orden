// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  inbox: vi.fn(),
  detail: vi.fn(),
  receive: vi.fn(),
  verify: vi.fn(),
}));
vi.mock("@/lib/nexora-transfer-inbox", () => ({
  loadTransferInbox: mocks.inbox,
  loadTransferDetail: mocks.detail,
  TransferModuleUnavailableError: class extends Error {},
}));
vi.mock("@/lib/nexora-transfer-api", () => ({
  receiveMultisiteTransfer: mocks.receive,
  verifyMultisiteOriginReturn: mocks.verify,
}));
vi.mock("@/components/transfers/TransferReceiptChecklist", () => ({
  TransferReceiptChecklist: ({onConfirm}:{onConfirm:(plan:unknown)=>Promise<void>}) =>
    <button onClick={()=>void onConfirm({
      dispatchedCount:2,receivedCount:2,missingCount:0,receivedUnitIds:["unit-1","unit-2"],pendingOriginReturn:[],
    })}>Confirmar recepción de prueba</button>,
}));
vi.mock("@/components/transfers/OriginReturnChecklist", () => ({
  OriginReturnChecklist: ({onConfirm}:{onConfirm:(rows:unknown[])=>Promise<void>}) =>
    <button onClick={()=>void onConfirm([
      {unitId:"unit-3",found:true,observation:""},
    ])}>Confirmar retorno de prueba</button>,
}));
import TrasladosPiloto from "./index";

const origin = {
  id: "t-1", code: "TRA-0001", kind: "envio", status: "en_transito",
  origin_site_id:"b1", destination_site_id:"l1", original_transfer_id:null,
  created_at:"2026-11-01T10:00:00Z",dispatched_at:"2026-11-01T10:00:00Z",
  received_at:null,notes:null,
  originLabel:"Bodega A · Ciudad A",destinationLabel:"Local A · Ciudad A",
};
const returning = {
  ...origin, id:"r-1",code:"RET-0001",kind:"retorno_faltantes",
  status:"pendiente_recepcion",original_transfer_id:"t-1",
  originLabel:"Local A · Ciudad A",destinationLabel:"Bodega A · Ciudad A",
};
const dispatched = [
  {unitId:"unit-1",serial:"350000000000001",receiptStatus:"pendiente",observation:"",isOpen:true},
  {unitId:"unit-2",serial:"350000000000002",receiptStatus:"pendiente",observation:"",isOpen:true},
];

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Bandeja de traslados (piloto solo admin)", () => {
  it("muestra documentos por sede y selecciona la recepción real", async () => {
    mocks.inbox.mockResolvedValue([origin,returning]);
    mocks.detail.mockImplementation(async (item:{id:string}) =>
      item.id==="t-1" ? {transfer:origin,units:dispatched} : {
        transfer:returning,units:[{unitId:"unit-3",serial:"350000000000003",
          receiptStatus:"pendiente",observation:"",isOpen:true}],
      });
    const user=userEvent.setup();
    render(<MemoryRouter><TrasladosPiloto /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("TRA-0001")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Confirmar recepción de prueba")).toBeTruthy());
    await user.click(screen.getByRole("button",{name:"Devoluciones"}));
    await user.click(screen.getByText("RET-0001"));
    await waitFor(() => expect(screen.getByText("Confirmar retorno de prueba")).toBeTruthy());
  });

  it("solo considera exitosa una recepción cuando confirma el RPC", async () => {
    mocks.inbox.mockResolvedValue([origin]);
    mocks.detail.mockResolvedValue({transfer:origin,units:dispatched});
    mocks.receive.mockResolvedValue({
      transferId:"t-1",status:"recibido",idempotent:false,receivedCount:2,missingCount:0,
    });
    const user=userEvent.setup();
    render(<MemoryRouter><TrasladosPiloto /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Confirmar recepción de prueba")).toBeTruthy());
    await user.click(screen.getByText("Confirmar recepción de prueba"));
    await waitFor(() => expect(mocks.receive).toHaveBeenCalledWith(expect.objectContaining({
      transferId:"t-1",dispatched:expect.arrayContaining([
        {unitId:"unit-1",serial:"350000000000001"},
      ]),
    })));
  });

  it("no finge que la base multisede está activa si faltan sus tablas", async () => {
    mocks.inbox.mockRejectedValue(new Error("Los traslados multisede aún no están activados en el servidor."));
    render(<MemoryRouter><TrasladosPiloto /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText("No se puede abrir el módulo")).toBeTruthy();
    expect(screen.queryByText("Confirmar recepción de prueba")).toBeNull();
  });
});
