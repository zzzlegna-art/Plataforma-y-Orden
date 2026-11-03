import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { NexoraSite } from "./nexora-sites";
import { canPlanTransferRoute, classifyPlannedTransferRoute } from "./nexora-transfer-route-policy";

const makeSite=(id:string,cityId:string,siteType:NexoraSite["siteType"],
  parentSiteId:string|null=null,isActive=true):NexoraSite=>({
  id,cityId,siteType,parentSiteId,isActive,name:id,address:null,
});
const principal=makeSite("6a","barranquilla","principal");
const barranquillaStore=makeSite("iphone-america","barranquilla","local","6a");
const regionalCali=makeSite("bodega-cali","cali","bodega","6a");
const storeCali=makeSite("local-cali","cali","local","bodega-cali");
const regionalMedellin=makeSite("bodega-medellin","medellin","bodega","6a");
const regionalCali2=makeSite("bodega-cali-2","cali","bodega","6a");
const otherStoreCali=makeSite("otro-local-cali","cali","local","bodega-cali");

describe("Nexora V4 · rutas de mercancía permitidas, no operativas",()=>{
  it("permite principal→regional y regional→regional entre distintas ciudades",()=>{
    expect(classifyPlannedTransferRoute(principal,regionalCali))
      .toBe("principal_to_regional");
    expect(classifyPlannedTransferRoute(regionalCali,regionalMedellin))
      .toBe("regional_to_regional");
    expect(classifyPlannedTransferRoute(regionalMedellin,regionalCali))
      .toBe("regional_to_regional");
  });
  it("permite abastecer exclusivamente el local a cargo, incluso desde 6A",()=>{
    expect(classifyPlannedTransferRoute(regionalCali,storeCali))
      .toBe("warehouse_to_own_store");
    expect(classifyPlannedTransferRoute(principal,barranquillaStore))
      .toBe("warehouse_to_own_store");
  });
  it("permite devolución local→bodega matriz, pero no a bodegas ajenas",()=>{
    expect(classifyPlannedTransferRoute(storeCali,regionalCali))
      .toBe("store_to_parent_warehouse");
    expect(classifyPlannedTransferRoute(barranquillaStore,principal))
      .toBe("store_to_parent_warehouse");
    expect(canPlanTransferRoute(storeCali,regionalMedellin)).toBe(false);
    expect(canPlanTransferRoute(storeCali,principal)).toBe(false);
    expect(canPlanTransferRoute(storeCali,regionalCali2)).toBe(false);
  });
  it("prohíbe local→local, rutas de retorno de bodega→principal y sedes iguales",()=>{
    expect(canPlanTransferRoute(storeCali,otherStoreCali)).toBe(false);
    expect(canPlanTransferRoute(storeCali,barranquillaStore)).toBe(false);
    expect(canPlanTransferRoute(regionalCali,principal)).toBe(false);
    expect(canPlanTransferRoute(regionalCali,regionalCali)).toBe(false);
    expect(canPlanTransferRoute(regionalCali,regionalCali2)).toBe(false);
    expect(canPlanTransferRoute(principal,regionalMedellin)).toBe(true);
  });
  it("rechaza sedes inactivas, inexistentes y locales ajenos",()=>{
    expect(canPlanTransferRoute(null,regionalCali)).toBe(false);
    expect(canPlanTransferRoute(principal,undefined)).toBe(false);
    expect(canPlanTransferRoute(principal,{...regionalCali,isActive:false})).toBe(false);
    expect(canPlanTransferRoute({...principal,isActive:false},regionalCali)).toBe(false);
    expect(canPlanTransferRoute(regionalCali,barranquillaStore)).toBe(false);
    expect(canPlanTransferRoute(regionalMedellin,storeCali)).toBe(false);
  });
  it("refleja en SQL las cuatro rutas (sin modificar el ejecutor actual)",()=>{
    const sql=readFileSync(new URL(
      "../../supabase/migrations/20261103080000_nexora_site_role_scope_basis.sql",
      import.meta.url),"utf8");
    expect(sql).toContain("o.site_type='principal' and d.site_type='bodega'");
    expect(sql).toContain("o.site_type='bodega' and d.site_type='bodega'");
    expect(sql).toContain("o.city_id<>d.city_id");
    expect(sql).toContain("d.site_type='local'");
    expect(sql).toContain("d.parent_site_id=o.id and o.city_id=d.city_id");
    expect(sql).toContain("o.site_type='local' and d.site_type in ('principal','bodega')");
    expect(sql).toContain("o.parent_site_id=d.id and o.city_id=d.city_id");
    expect(sql).not.toMatch(/create or replace function nexora_internal\.execute_transfer/i);
  });
});
