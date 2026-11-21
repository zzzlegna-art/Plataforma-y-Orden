import { describe, expect, it } from "vitest";
import { parseReferenceStock } from "./nexora-reference-stock";

const sample=()=>({
  initialApproved:true,scope:"serialized_imei_only",page:1,pageSize:20,matched:1,
  items:[{
    productId:"product-1",name:"iPhone 13",sku:"IP13",
    total:4,physicallyVerified:2,committedOrders:1,
    unverified:1,inTransit:0,pendingReturn:0,sold:1,
  }],
});

describe("Nexora · existencias consolidadas por referencia",()=>{
  it("conserva los conteos físicos y las unidades asociadas a pedidos",()=>{
    const r=parseReferenceStock(sample());
    expect(r.items[0].physicallyVerified).toBe(2);
    expect(r.items[0].committedOrders).toBe(1);
    expect(r.items[0].total).toBe(4);
    expect(r.scope).toBe("serialized_imei_only");
  });
  it("rechaza totales inconsistentes y cantidades corruptas",()=>{
    const data=sample();
    expect(()=>parseReferenceStock({...data,items:[{...data.items[0],total:5}]})).toThrow();
    expect(()=>parseReferenceStock({...data,items:[{...data.items[0],committedOrders:3}]})).toThrow();
    expect(()=>parseReferenceStock({...data,items:[{...data.items[0],sold:"1"}]})).toThrow();
    expect(()=>parseReferenceStock({...data,scope:"non_serialized_merged"})).toThrow();
    expect(()=>parseReferenceStock({...data,pageSize:51})).toThrow();
    expect(()=>parseReferenceStock({...data,matched:-1})).toThrow();
  });
  it("admite inventario pendiente sin ubicación verificada",()=>{
    const data=sample();
    const r=parseReferenceStock({...data,initialApproved:false,items:[{
      ...data.items[0],physicallyVerified:0,committedOrders:0,unverified:3,sold:1,
    }]});
    expect(r.items[0].physicallyVerified).toBe(0);
    expect(r.items[0].unverified).toBe(3);
  });
});
