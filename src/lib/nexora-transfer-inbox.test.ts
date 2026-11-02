import { describe, expect, it } from "vitest";
import {
  buildTransferViews, loadTransferDetail, loadTransferInbox,
  TransferModuleUnavailableError, type TransferReadClient, type TransferView,
} from "./nexora-transfer-inbox";

const transfer: TransferView = {
  id: "transfer-1", code: "TRA-0001", kind: "envio", status: "en_transito",
  origin_site_id: "warehouse", destination_site_id: "local",
  original_transfer_id: null, notes: null, created_at: "2026-11-01T11:00:00Z",
  dispatched_at: "2026-11-01T11:05:00Z", received_at: null,
  originLabel: "Bodega Central · Ciudad A", destinationLabel: "Local Norte · Ciudad A",
};

const responseClient = (dataByTable: Record<string,{data: unknown; error?: {code?:string;message:string} | null}>) =>
  ({
    from: (table: string) => ({
      select: (_columns: string) => {
        const state: { inValues: string[] | null } = { inValues: null };
        const query = {
          eq: (_field:string,_value:string) => query,
          in: (_field:string,ids:string[]) => { state.inValues=ids; return query; },
          order: (_field:string,_options?:{ascending:boolean}) => query,
          limit: (_size:number) => query,
          single: () => query,
          then: <T>(resolve: (value:{data:unknown;error:{message:string;code?:string}|null})=>T) => {
            const row = dataByTable[table];
            const d = row?.data;
            const result = table === "bodega_units" && Array.isArray(d) && state.inValues
              ? d.filter((entry: { id:string }) => state.inValues?.includes(entry.id)) : d;
            return Promise.resolve(resolve({data:result ?? null,error:row?.error ?? null}));
          },
        };
        return query;
      },
    }),
  }) as unknown as TransferReadClient;

describe("Bandeja multisede sin escritura de inventario", () => {
  it("muestra las bodegas y ciudades sin perder el origen de la mercancía", () => {
    const [row] = buildTransferViews([transfer], [
      {id:"warehouse",name:"Bodega Central",city_id:"city-a"},
      {id:"local",name:"Local Norte",city_id:"city-a"},
    ],[{id:"city-a",name:"Ciudad A"}]);
    expect(row.originLabel).toBe("Bodega Central · Ciudad A");
    expect(row.destinationLabel).toBe("Local Norte · Ciudad A");
  });

  it("lista documentos reales sin modificar su estado", async () => {
    const client = responseClient({
      nexora_transfers:{data:[transfer]},
      nexora_sites:{data:[
        {id:"warehouse",name:"Bodega Central",city_id:"city-a"},
        {id:"local",name:"Local Norte",city_id:"city-a"},
      ]},
      nexora_cities:{data:[{id:"city-a",name:"Ciudad A"}]},
    });
    const rows = await loadTransferInbox(client);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("en_transito");
    expect(rows[0].destinationLabel).toContain("Local Norte");
  });

  it("carga todos los IMEI del acta antes de permitir una recepción", async () => {
    const client = responseClient({
      nexora_transfer_units:{data:[
        {unit_id:"unit-a",receipt_status:"pendiente",receipt_observation:null,is_open:true},
        {unit_id:"unit-b",receipt_status:"pendiente",receipt_observation:null,is_open:true},
      ]},
      bodega_units:{data:[
        {id:"unit-a",serial:"350000000000001"},
        {id:"unit-b",serial:"350000000000002"},
      ]},
    });
    const detail=await loadTransferDetail(transfer,client);
    expect(detail.units.map(unit=>unit.serial)).toEqual(["350000000000001","350000000000002"]);
    expect(detail.units.every(unit=>unit.isOpen)).toBe(true);
  });

  it("bloquea la recepción si falta información del IMEI por RLS o consulta incompleta", async () => {
    const client = responseClient({
      nexora_transfer_units:{data:[
        {unit_id:"unit-a",receipt_status:"pendiente",receipt_observation:null,is_open:true},
        {unit_id:"unit-b",receipt_status:"pendiente",receipt_observation:null,is_open:true},
      ]},
      bodega_units:{data:[{id:"unit-a",serial:"350000000000001"}]},
    });
    await expect(loadTransferDetail(transfer,client)).rejects.toThrow(/todos los IMEI/);
  });

  it("distingue migración ausente de un acta vacía", async () => {
    const client = responseClient({
      nexora_transfers:{data:null,error:{code:"PGRST205",message:"table absent"}},
      nexora_sites:{data:[]},nexora_cities:{data:[]},
    });
    await expect(loadTransferInbox(client)).rejects.toBeInstanceOf(TransferModuleUnavailableError);
  });
});
