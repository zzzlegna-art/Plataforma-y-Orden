import { describe, expect, it } from "vitest";
import { parseReferenceStock } from "./nexora-reference-stock";

const sample=()=>({
  initialApproved:true,
  scope:"serialized_imei_only",
  page:1,pageSize:20,matched:1,
  items:[{
    productId:"product-1",name:"iPhone 13",sku:"IP13",
    total:4,physicallyVerified:2,available:1,
    unverified:1,inTransit:0,pendingReturn:0,sold:1,
    sites:[
      {siteId:"site-1",siteName:"Local Centro",cityName:"Barranquilla",
        total:2,physicallyVerified:2,available:1,
        unverified:0,inTransit:0,pendingReturn:0,sold:0},
      {siteId:null,siteName:"Sin sede verificada",cityName:null,
        total:2,physicallyVerified:0,available:0,
        unverified:1,inTransit:0,pendingReturn:0,sold:1},
    ],
  }],
});

describe("Nexora Multisede · referencias y sedes",()=>{
  it("conserva costo comercial implícito, ubicaciones físicas y unidades no conciliadas",()=>{
    const r=parseReferenceStock(sample());
    expect(r.items[0].available).toBe(1);
    expect(r.items[0].physicallyVerified).toBe(2);
    expect(r.items[0].total).toBe(4);
    expect(r.items[0].sites[1].siteId).toBeNull();
    expect(r.scope).toBe("serialized_imei_only");
  });
  it("rechaza asignaciones falsas de stock a sede desconocida",()=>{
    const data=sample();
    expect(()=>parseReferenceStock({...data,items:[{
      ...data.items[0],sites:[data.items[0].sites[0],{
        ...data.items[0].sites[1],available:1,
      }],
    }]})).toThrow();
  });
  it("rechaza totales inconsistentes y cantidades corruptas",()=>{
    const data=sample();
    expect(()=>parseReferenceStock({...data,items:[{
      ...data.items[0],total:5,
    }]})).toThrow();
    expect(()=>parseReferenceStock({...data,items:[{
      ...data.items[0],available:"1",
    }]})).toThrow();
    expect(()=>parseReferenceStock({...data,items:[{
      ...data.items[0],sites:data.items[0].sites.slice(0,1),
    }]})).toThrow();
    expect(()=>parseReferenceStock({...data,scope:"non_serialized_merged"})).toThrow();
    expect(()=>parseReferenceStock({...data,pageSize:51})).toThrow();
    expect(()=>parseReferenceStock({...data,matched:-1})).toThrow();
  });
  it("admite una red sin sedes: ninguna unidad es disponible",()=>{
    const data=sample();
    const r=parseReferenceStock({
      ...data,initialApproved:false,
      items:[{...data.items[0],total:4,physicallyVerified:0,available:0,
        unverified:3,sold:1,sites:[{
          siteId:null,siteName:"Sin sede verificada",cityName:null,
          total:4,physicallyVerified:0,available:0,
          unverified:3,inTransit:0,pendingReturn:0,sold:1,
        }]}],
    });
    expect(r.items[0].available).toBe(0);
  });
});
