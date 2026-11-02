import {describe,expect,it} from "vitest";
import {
  allowedParents,validateSiteDraft,
  type NexoraCity,type NexoraSite,
} from "./nexora-sites";
const baq:NexoraCity={id:"barranquilla",name:"Barranquilla",region:"Atlántico"};
const cali:NexoraCity={id:"cali",name:"Cali",region:"Valle del Cauca"};
const root:NexoraSite={
  id:"cf03b83a-a23f-4bd2-a778-2c071fa9df2e",
  cityId:baq.id,name:"Bodega 6A",siteType:"principal",parentSiteId:null,
  address:"Cl. 34 #44 - 63",isActive:true,
};
const barranquillaStore:NexoraSite={
  id:"d1ee58e6-de76-4f66-8561-b882c9b831af",
  cityId:baq.id,name:"iPhone America",siteType:"local",parentSiteId:root.id,
  address:"Cra. 45b # 34 - 32",isActive:true,
};
const caliWarehouse:NexoraSite={
  id:"11111111-1111-4111-8111-111111111111",
  cityId:cali.id,name:"Bodega regional Cali",siteType:"bodega",
  parentSiteId:root.id,address:null,isActive:true,
};
describe("Nexora · jerarquía real de distribución Bodega 6A",()=>{
  it("abastece desde 6A bodegas de cualquier ciudad",()=>{
    const list=allowedParents("bodega",cali.id,[root,barranquillaStore]);
    expect(list.map(x=>x.name)).toEqual(["Bodega 6A"]);
    expect(validateSiteDraft({
      name:"Bodega regional Cali",cityId:cali.id,siteType:"bodega",
      parentSiteId:root.id,
    },[baq,cali],[root,barranquillaStore])).toBeNull();
  });
  it("iPhone America es local dependiente, no es origen para otras bodegas",()=>{
    expect(barranquillaStore.siteType).toBe("local");
    expect(barranquillaStore.parentSiteId).toBe(root.id);
    expect(allowedParents("bodega",cali.id,[root,barranquillaStore])
      .some(x=>x.id===barranquillaStore.id)).toBe(false);
  });
  it("local de Cali depende de bodega Cali; local Barranquilla puede depender de 6A",()=>{
    expect(allowedParents("local",cali.id,[root,barranquillaStore,caliWarehouse])
      .map(x=>x.name)).toEqual(["Bodega regional Cali"]);
    expect(allowedParents("local",baq.id,[root,barranquillaStore,caliWarehouse])
      .map(x=>x.name)).toEqual(["Bodega 6A"]);
  });
  it("rechaza otra principal al existir la central Bodega 6A",()=>{
    const error=validateSiteDraft({
      name:"Otra central",cityId:cali.id,siteType:"principal",parentSiteId:null,
    },[baq,cali],[root,barranquillaStore]);
    expect(error).toContain("ya tiene una sede principal");
  });
});
