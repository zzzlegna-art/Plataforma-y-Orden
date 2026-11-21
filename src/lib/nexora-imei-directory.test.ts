import { describe, expect, it } from "vitest";
import { parseImeiDirectory, CUSTODY_LABEL } from "./nexora-imei-directory";

const sample=()=>({
  initialApproved:false,
  summary:{sinConciliar:2758,enSede:0,enTransito:0,retornoPendiente:0,vendidos:395,total:3153},
  page:1,pageSize:25,matched:2758,
  items:[{
    unitId:"unit-1",serial:"000012345678901",productName:"iPhone 13",
    sku:"IP13",unitStatus:"en_bodega",custodyState:"sin_conciliar",
    historicalLocation:"Bodega",committedOrder:false,
  }],
});
describe("Nexora · control individual de seriales",()=>{
  it("conserva seriales históricos sin atribuirles ubicación física",()=>{
    const r=parseImeiDirectory(sample());
    expect(r.summary.sinConciliar).toBe(2758);
    expect(r.summary.vendidos).toBe(395);
    expect(r.items[0].serial).toBe("000012345678901");
    expect(r.items[0].custodyState).toBe("sin_conciliar");
    expect(CUSTODY_LABEL.sin_conciliar).toBe("Pendiente de conciliación");
  });
  it("mantiene el vínculo con pedidos activos",()=>{
    const data=sample();
    const r=parseImeiDirectory({...data,initialApproved:true,items:[{
      ...data.items[0],custodyState:"en_sede",committedOrder:true,
    }]});
    expect(r.items[0].committedOrder).toBe(true);
    expect(r.items[0].custodyState).toBe("en_sede");
  });
  it("rechaza estados desconocidos, conteos corruptos y estructuras incompletas",()=>{
    const data=sample();
    expect(()=>parseImeiDirectory(null)).toThrow();
    expect(()=>parseImeiDirectory({...data,summary:{...data.summary,total:-1}})).toThrow();
    expect(()=>parseImeiDirectory({...data,items:[{...data.items[0],committedOrder:"no"}]})).toThrow();
    expect(()=>parseImeiDirectory({...data,items:[{...data.items[0],custodyState:"disponible"}]})).toThrow();
  });
});
