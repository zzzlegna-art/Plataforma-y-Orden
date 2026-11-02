import { describe,expect,it } from "vitest";
import { parseMultisiteImeiTimeline } from "./nexora-imei-timeline";

const id="123e4567-e89b-12d3-a456-426614174000";
const sample=()=>({
  scope:"multisite_confirmed_only",unitId:id,serial:"000123456789012",
  total:3,page:1,pageSize:25,items:[
    {eventId:"transfer:t1:returned",eventType:"transfer_returned",
      eventAt:"2026-11-02T11:00:00Z",
      description:"Devolución física de este IMEI confirmada",
      originSite:"Local",destinationSite:"Bodega",reference:"Traslado #10",unitState:"returned"},
    {eventId:"transfer:t1:missing",eventType:"transfer_return_pending",
      eventAt:"2026-11-01T11:00:00Z",
      description:"Faltante registrado: documento de devolución pendiente",
      originSite:"Bodega",destinationSite:"Local",reference:"Traslado #10",unitState:"returned"},
    {eventId:"initial:1",eventType:"initial_approved",
      eventAt:"2026-10-30T11:00:00Z",
      description:"Conciliación física inicial aprobada",
      originSite:null,destinationSite:"Bodega",reference:null,unitState:"approved"},
  ],
});
describe("Nexora · hoja de vida IMEI multisede",()=>{
  it("mantiene el serial exacto y ordena solo los hitos multisede",()=>{
    const r=parseMultisiteImeiTimeline(sample(),id);
    expect(r.serial).toBe("000123456789012");
    expect(r.items.map(e=>e.eventType)).toEqual([
      "transfer_returned","transfer_return_pending","initial_approved"]);
  });
  it("rechaza unidad equivocada y un ámbito de historial no comprobado",()=>{
    const obj=sample();
    expect(()=>parseMultisiteImeiTimeline(obj,"223e4567-e89b-12d3-a456-426614174000")).toThrow();
    expect(()=>parseMultisiteImeiTimeline({...obj,scope:"legacy_unverified"},id)).toThrow();
  });
  it("rechaza fechas inventadas, eventos repetidos o tipos desconocidos",()=>{
    const obj=sample();
    expect(()=>parseMultisiteImeiTimeline({...obj,items:[
      {...obj.items[0],eventAt:"ayer"},...obj.items.slice(1),
    ]},id)).toThrow();
    expect(()=>parseMultisiteImeiTimeline({...obj,items:[
      obj.items[0],{...obj.items[0]},
    ]},id)).toThrow();
    expect(()=>parseMultisiteImeiTimeline({...obj,items:[
      {...obj.items[0],eventType:"transfer_recovered_without_scan"},
    ]},id)).toThrow();
  });
  it("rechaza cronología desordenada y paginaciones inseguras",()=>{
    const obj=sample();
    expect(()=>parseMultisiteImeiTimeline({...obj,items:[obj.items[1],obj.items[0]]},id)).toThrow();
    expect(()=>parseMultisiteImeiTimeline({...obj,pageSize:51},id)).toThrow();
    expect(()=>parseMultisiteImeiTimeline({...obj,total:1},id)).toThrow();
  });
  it("acepta la ausencia de operaciones multisede, sin borrar el pasado",()=>{
    expect(parseMultisiteImeiTimeline({
      ...sample(),total:0,items:[],
    },id).items).toEqual([]);
  });
});
