import { describe, expect, it } from "vitest";
import { parseImeiDirectory, CUSTODY_LABEL, getImeiCommercialStatus } from "./nexora-imei-directory";

const sample=()=>({
  initialApproved:false,
  summary:{
    sinConciliar:2758,enSede:0,enTransito:0,
    retornoPendiente:0,vendidos:395,sinCosto:2750,total:3153,
  },
  sites:[],
  page:1,pageSize:25,matched:2758,
  items:[{
    unitId:"unit-1",serial:"000012345678901",productName:"iPhone 13",
    sku:"IP13",cost:null,unitStatus:"en_bodega",
    custodyState:"sin_conciliar",siteId:null,siteName:null,
    cityName:null,historicalLocation:"Bodega",
    committedOrder:false,committedTransfer:false,commercialCandidate:false,
  }],
});
describe("Nexora · inventario individual por sede",()=>{
  it("presenta el stock heredado como sin conciliar, nunca local ficticio",()=>{
    const r=parseImeiDirectory(sample());
    expect(r.summary.sinConciliar).toBe(2758);
    expect(r.summary.vendidos).toBe(395);
    expect(r.items[0].siteId).toBeNull();
    expect(r.items[0].commercialCandidate).toBe(false);
    expect(CUSTODY_LABEL.sin_conciliar).toBe("Sin sede verificada");
  });
  it("conserva los costos desconocidos como null y el serial con ceros iniciales",()=>{
    const r=parseImeiDirectory(sample());
    expect(r.items[0].cost).toBeNull();
    expect(r.items[0].serial).toBe("000012345678901");
    expect(r.summary.sinCosto).toBe(2750);
  });
  it("admite costo individual real en una sede verificada",()=>{
    const data=sample();
    expect(parseImeiDirectory({...data,initialApproved:true,items:[{
      ...data.items[0],cost:950000,custodyState:"en_sede",
      siteId:"s1",siteName:"Local Centro",cityName:"Barranquilla",
      commercialCandidate:true,
    }]}).items[0].cost).toBe(950000);
  });
  it("rechaza una disponibilidad inventada fuera de sede",()=>{
    const data=sample();
    expect(()=>parseImeiDirectory({...data,items:[{
      ...data.items[0],commercialCandidate:true,
    }]})).toThrow(/no conciliar|atribuir/i);
    expect(()=>parseImeiDirectory({...data,items:[{
      ...data.items[0],siteId:"s1",
    }]})).toThrow();
  });
  it("falla cerrado ante estados desconocidos, números corruptos o estructuras incompletas",()=>{
    const data=sample();
    expect(()=>parseImeiDirectory(null)).toThrow();
    expect(()=>parseImeiDirectory({...data,summary:{...data.summary,sinConciliar:-1}})).toThrow();
    expect(()=>parseImeiDirectory({...data,items:[{
      ...data.items[0],cost:"0",
    }]})).toThrow();
    expect(()=>parseImeiDirectory({...data,items:[{
      ...data.items[0],custodyState:"disponible_sin_verificacion",
    }]})).toThrow();
  });
});

describe("Nexora: IMEI asociado a un pedido no se ofrece como disponible", () => {
  it("conserva la sede física pero identifica claramente el pedido", () => {
    const input = sample();
    const r = parseImeiDirectory({
      ...input, initialApproved: true,
      items: [{
        ...input.items[0], custodyState: "en_sede",
        siteId: "bodega-6a", siteName: "Bodega 6A", cityName: "Barranquilla",
        committedOrder: true, commercialCandidate: false,
      }],
    });
    expect(r.items[0].siteName).toBe("Bodega 6A");
    expect(getImeiCommercialStatus(r.items[0])).toBe("Asignado a pedido");
  });
  it("rechaza un serial en pedido que el servidor marque como disponible", () => {
    const input = sample();
    expect(() => parseImeiDirectory({
      ...input, initialApproved: true,
      items: [{
        ...input.items[0], custodyState: "en_sede",
        siteId: "bodega-6a", siteName: "Bodega 6A", cityName: "Barranquilla",
        committedOrder: true, commercialCandidate: true,
      }],
    })).toThrow(/comprometido/);
  });
});
