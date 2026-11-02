import { describe,expect,it } from "vitest";
import { parsePhysicalScanBatch,parsePhysicalBatchReceipt } from "./nexora-physical-scan-batch";
const site="123e4567-e89b-12d3-a456-426614174000";
const obs=(serial:string)=>({
  observationId:"cdef1111-1111-4111-8111-111111111111",
  unitId:"ddef1111-1111-4111-8111-111111111111",
  siteId:site,serial,status:"en_bodega",checkedAt:"2026-11-02T19:00:00Z",
});
describe("Nexora · escaneo físico masivo",()=>{
  it("separa lecturas, conserva orden y rechaza duplicados",()=>{
    expect(parsePhysicalScanBatch("123\n456;789,abc\tDEF")).toEqual(["123","456","789","abc","DEF"]);
    expect(()=>parsePhysicalScanBatch("IMEI-1\nimei-1")).toThrow(/repetidos/i);
    expect(()=>parsePhysicalScanBatch("")).toThrow();
    expect(()=>parsePhysicalScanBatch("A".repeat(161))).toThrow();
    expect(()=>parsePhysicalScanBatch(Array.from({length:51},(_,i)=>String(i)).join("\n"))).toThrow();
  });
  it("verifica respuesta íntegra del RPC y respeta el estado provisional",()=>{
    const receipt=parsePhysicalBatchReceipt({
      scope:"physical_scan_batch",siteId:site,registered:1,
      inventoryApproved:false,items:[obs("123456789012345")],
    },site,["123456789012345"]);
    expect(receipt.registered).toBe(1);
    expect(receipt.inventoryApproved).toBe(false);
  });
  it("rechaza respuesta de otra sede o con registros omitidos o vendidos",()=>{
    const base={
      scope:"physical_scan_batch",siteId:site,registered:1,
      inventoryApproved:false,items:[obs("123")],
    };
    expect(()=>parsePhysicalBatchReceipt({...base,siteId:"otra"},site,["123"])).toThrow();
    expect(()=>parsePhysicalBatchReceipt({...base,registered:2},site,["123"])).toThrow();
    expect(()=>parsePhysicalBatchReceipt({...base,inventoryApproved:true},site,["123"])).toThrow();
    expect(()=>parsePhysicalBatchReceipt({...base,items:[{...obs("123"),status:"vendido"}]},site,["123"])).toThrow();
    expect(()=>parsePhysicalBatchReceipt(base,site,["999"])).toThrow();
  });
});
