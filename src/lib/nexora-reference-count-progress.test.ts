import { describe,expect,it } from "vitest";
import {
  buildInitialCountReferenceCsv,summarizeInitialCountByReference,
} from "./nexora-reference-count-progress";
import type {
  InitialCountWorklist,InitialCountWorklistRow,
} from "./nexora-initial-count-worklist";

const row=(serial:string,sku:string,state:"pendiente"|"cotejado"|"revisar",cost:number|null=null):InitialCountWorklistRow=>({
  unitId:"unit-"+serial,serial,sku,productName:sku==="SKU-A"?"=Celular Azul":"Celular Blanco",
  legacyStatus:"en_bodega",condition:"nuevo",historicalLocation:"Bodega antigua",cost,
  reconciliationState:state,
  observedSiteId:state==="pendiente"?null:"123e4567-e89b-12d3-a456-426614174000",
  observedSiteName:state==="pendiente"?null:"Principal (NO aprobada)",
  observedCityName:state==="pendiente"?null:"Barranquilla",
  observedAt:state==="pendiente"?null:"2026-11-02T18:00:00Z",
});
const sample=():InitialCountWorklist=>({
  scope:"initial_physical_inventory_worklist",
  snapshotAt:"2026-11-02T19:00:00Z",
  eligible:4,excludedHistorical:395,pending:2,verified:1,stale:1,
  withoutValidCost:3,rows:[
    row("123456789012345","SKU-A","pendiente"),
    row("123456789012346","SKU-A","revisar"),
    row("123456789012347","SKU-B","cotejado",250000),
    row("123456789012348","SKU-B","pendiente"),
  ],
});
describe("Nexora · progreso de conciliación física por referencia",()=>{
  it("agrupa el inventario real sin confundir vendidos con pendientes",()=>{
    const data=summarizeInitialCountByReference(sample());
    expect(data.eligible).toBe(4);
    expect(data.excludedHistorical).toBe(395);
    expect(data.pending).toBe(2);
    expect(data.verified).toBe(1);
    expect(data.stale).toBe(1);
    expect(data.withoutValidCost).toBe(3);
    expect(data.references).toHaveLength(2);
    expect(data.references[0]).toMatchObject({
      sku:"SKU-A",eligible:2,pending:1,verified:0,stale:1,withoutValidCost:2,
    });
    expect(data.references[1]).toMatchObject({
      sku:"SKU-B",eligible:2,pending:1,verified:1,stale:0,withoutValidCost:1,
    });
  });
  it("prioriza cotejos desactualizados y conserva sus IMEI exactos",()=>{
    const data=summarizeInitialCountByReference(sample());
    expect(data.staleUnits.map(x=>x.serial)).toEqual(["123456789012346"]);
    expect(data.staleUnits[0].observedSiteName).toBe("Principal (NO aprobada)");
  });
  it("impide mostrar datos incompletos, duplicados o estados comerciales vendidos",()=>{
    const s=sample();
    expect(()=>summarizeInitialCountByReference({...s,rows:s.rows.slice(1)})).toThrow();
    expect(()=>summarizeInitialCountByReference({...s,rows:[...s.rows.slice(0,3),s.rows[0]]})).toThrow();
    expect(()=>summarizeInitialCountByReference({...s,rows:[{...s.rows[0],legacyStatus:"vendido"},...s.rows.slice(1)]})).toThrow();
    expect(()=>summarizeInitialCountByReference({...s,stale:0})).toThrow();
  });
  it("exporta todas las referencias e IMEI para revisar, escapando fórmulas",()=>{
    const csv=buildInitialCountReferenceCsv(sample());
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(`"'=Celular Azul"`);
    expect(csv).toContain("SKU-A");
    expect(csv).toContain("SKU-B");
    expect(csv).toContain("'123456789012346");
    expect(csv).toContain("Cotejos desactualizados por revisar");
    expect(csv).toContain("Pendiente NO significa faltante físico");
    expect(csv).toContain("395");
    expect(csv).not.toContain("'123456789012345");
  });
  it("informa correctamente que no hay inventario elegible",()=>{
    const s=sample();
    const empty:InitialCountWorklist={...s,eligible:0,pending:0,verified:0,stale:0,withoutValidCost:0,rows:[]};
    expect(summarizeInitialCountByReference(empty).references).toEqual([]);
    expect(buildInitialCountReferenceCsv(empty)).toContain("0");
  });
});
