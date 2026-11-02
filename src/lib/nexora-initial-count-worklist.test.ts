import { describe,expect,it } from "vitest";
import { buildInitialCountWorklistCsv,parseInitialCountWorklist } from "./nexora-initial-count-worklist";

const unit=(serial:string,state:"pendiente"|"cotejado"|"revisar"="pendiente")=>({
  unitId:"unit-"+serial,serial,productName:"+Telefono Azul",sku:"SKU-1",
  legacyStatus:"en_bodega",condition:"nuevo",historicalLocation:"Bodega antigua",
  cost:null,reconciliationState:state,
  observedSiteId:state==="pendiente"?null:"11111111-1111-4111-8111-111111111111",
  observedSiteName:state==="pendiente"?null:"Principal (NO aprobada)",
  observedCityName:state==="pendiente"?null:"Barranquilla",
  observedAt:state==="pendiente"?null:"2026-11-02T18:00:00Z",
});
const example=()=>({
  scope:"initial_physical_inventory_worklist",
  snapshotAt:"2026-11-02T19:00:00Z",
  eligible:2,excludedHistorical:395,pending:1,verified:1,stale:0,withoutValidCost:1,
  rows:[
    unit("123456789012345"),
    {...unit("987654321098765","cotejado"),cost:125000},
  ],
});
describe("Nexora · planilla de inventario físico inicial",()=>{
  it("distingue equipos elegibles de vendidos y cotejados",()=>{
    const list=parseInitialCountWorklist(example());
    expect(list.eligible).toBe(2);
    expect(list.excludedHistorical).toBe(395);
    expect(list.pending).toBe(1);
    expect(list.verified).toBe(1);
    expect(list.withoutValidCost).toBe(1);
  });
  it("no acepta equipos vendidos, duplicados o conteos inconsistentes",()=>{
    const list=example();
    expect(()=>parseInitialCountWorklist({...list,rows:[{...list.rows[0],legacyStatus:"vendido"},list.rows[1]]})).toThrow();
    expect(()=>parseInitialCountWorklist({...list,rows:[list.rows[0],list.rows[0]]})).toThrow();
    expect(()=>parseInitialCountWorklist({...list,pending:2})).toThrow();
    expect(()=>parseInitialCountWorklist({...list,withoutValidCost:2})).toThrow();
  });
  it("no atribuye una sede a un cotejo pendiente",()=>{
    const l=example();
    expect(()=>parseInitialCountWorklist({...l,rows:[{...l.rows[0],observedSiteName:"No confirmada"},l.rows[1]]})).toThrow();
  });
  it("CSV protege texto de fórmulas y añade campos para conteo humano",()=>{
    const r=example();
    r.rows[0].sku="=IMPORTXML(A1)";
    const csv=buildInitialCountWorklistCsv(parseInitialCountWorklist(r));
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(`"'=IMPORTXML(A1)"`);
    expect(csv).toContain(`"'+Telefono Azul"`);
    expect(csv).toContain("Contado físicamente (Sí/No)");
    expect(csv).toContain("Ubicación histórica NO verificada");
    expect(csv).toContain("Registros históricos excluidos");
    expect(csv).toContain("125000.00");
    expect(csv).toContain("'123456789012345");
    expect(csv).not.toContain('"vendido"');
  });
  it("rechaza exportaciones vacías simuladas o incompletas",()=>{
    const list=example();
    expect(()=>buildInitialCountWorklistCsv({...list,rows:[]} as never)).toThrow();
    expect(()=>parseInitialCountWorklist({...list,eligible:5001})).toThrow();
    expect(()=>parseInitialCountWorklist({...list,scope:"untrusted_scope"})).toThrow();
  });
});
