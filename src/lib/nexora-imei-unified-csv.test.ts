import { describe,expect,it,vi } from "vitest";
import {
  buildUnifiedImeiCsv,collectMultisiteEventsForExport,
  MAX_MULTISITE_EVENTS_FOR_EXPORT,safeCsvCell,
} from "./nexora-imei-unified-csv";
import type { MultisiteImeiEvent,MultisiteImeiTimeline } from "./nexora-imei-timeline";

const id="123e4567-e89b-12d3-a456-426614174000";
const serial="000123456789012";
const event=(index:number):MultisiteImeiEvent=>({
  eventId:"transfer:event-"+index,eventType:"transfer_received",
  eventAt:new Date(Date.UTC(2026,10,2,0,0,0)-index*60000).toISOString(),
  description:"Recibido en destino",originSite:"Bodega",
  destinationSite:"Local Centro",reference:"Traslado #1",unitState:"received",
});
const response=(page:number,total:number,items:MultisiteImeiEvent[]):MultisiteImeiTimeline=>({
  unitId:id,serial,scope:"multisite_confirmed_only",total,page,pageSize:25,items,
});

describe("Nexora · exportación unificada de hoja de vida IMEI",()=>{
  it("combina movimientos heredados y multisede sin borrar eventos distintos",()=>{
    const csv=buildUnifiedImeiCsv({
      serial,receivedAt:"2026-10-20T10:00:00Z",
      legacy:[{id:"old-1",fecha:"2026-10-31T10:00:00Z",tipo:"garantia",
        descripcion:"Garantía original",usuario:"Operador"}],
      multisite:[event(0)],
    });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'"+serial);
    expect(csv).toContain("Garantía original");
    expect(csv).toContain("Recibido en destino");
    expect(csv).toContain("Multisede confirmada");
    expect(csv.indexOf("Recibido en destino")).toBeLessThan(csv.indexOf("Garantía original"));
  });
  it("bloquea fórmulas de Excel y limpia saltos de línea sin destruir el texto",()=>{
    expect(safeCsvCell(" =SUM(1;2)")).toBe(`"'=SUM(1;2)"`);
    expect(safeCsvCell("\t@IMPORTXML(1)")).toBe(`"'@IMPORTXML(1)"`);
    expect(safeCsvCell("-1+2")).toBe(`"'-1+2"`);
    expect(safeCsvCell("a\"b;\nnew")).toBe(`"a""b; new"`);
  });
  it("consulta todas las páginas en orden y verifica la identidad del IMEI",async()=>{
    const first=Array.from({length:25},(_,index)=>event(index));
    const fetch=vi.fn(async(_unitId:string,page:number)=>page===1?
      response(1,26,first):response(2,26,[event(25)]));
    const events=await collectMultisiteEventsForExport(id,serial,fetch);
    expect(events).toHaveLength(26);
    expect(events[25].eventId).toBe("transfer:event-25");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(2,id,2);
  });
  it("rechaza mezcla de seriales, totales cambiantes y páginas vacías",async()=>{
    const first=Array.from({length:25},(_,index)=>event(index));
    await expect(collectMultisiteEventsForExport(id,serial,async()=>({
      ...response(1,1,[event(0)]),serial:"otro-imei",
    }))).rejects.toThrow();
    await expect(collectMultisiteEventsForExport(id,serial,
      async(_id,page)=>page===1?response(1,26,first):response(2,27,[event(25)]),
    )).rejects.toThrow();
    await expect(collectMultisiteEventsForExport(id,serial,
      async(_id,page)=>page===1?response(1,26,first):response(2,26,[]),
    )).rejects.toThrow();
  });
  it("rechaza registros repetidos o fuera de orden entre páginas",async()=>{
    const first=Array.from({length:25},(_,index)=>event(index));
    await expect(collectMultisiteEventsForExport(id,serial,
      async(_id,page)=>page===1?response(1,26,first):response(2,26,[event(24)]),
    )).rejects.toThrow();
    await expect(collectMultisiteEventsForExport(id,serial,
      async(_id,page)=>page===1?response(1,26,first):response(2,26,[event(0)]),
    )).rejects.toThrow();
  });
  it("rechaza exportaciones sobredimensionadas para no generar archivos parciales",async()=>{
    await expect(collectMultisiteEventsForExport(id,serial,async()=>response(
      1,MAX_MULTISITE_EVENTS_FOR_EXPORT+1,[],
    ))).rejects.toThrow();
  });
});
