import {describe,expect,it} from "vitest";
import {buildMissingUnitCostsCsv} from "./nexora-unit-cost-template";
import type {Product,Unit} from "./types";
const product={id:"p1",sku:"IP15P-256",name:"iPhone 15 Pro",cost:9999,
  price:10000,minStock:1,isActive:true,createdAt:"2026-11-01",updatedAt:"2026-11-01"} as Product;
const unit=(id:string,serial:string,status:Unit["status"],cost?:number)=>({
  id,serial,productId:"p1",status,condition:"seminuevo",cost,
  receivedAt:"2026-11-01",createdBy:"admin",
}) as Unit;
describe("Nexora · hoja de trabajo de costos reales",()=>{
  it("no copia el costo de producto como si fuera costo de IMEI",()=>{
    const csv=buildMissingUnitCostsCsv({products:[product],receptions:[],
      units:[unit("u1","IMEI-001","en_bodega")]});
    expect(csv).toContain("IMEI-001");
    expect(csv).toContain("SIN RECEPCIÓN");
    expect(csv).not.toContain("9999");
    expect(csv).toContain("Este CSV NO se importa automáticamente");
  });
  it("omite vendidos históricos y equipos con costo registrado",()=>{
    const csv=buildMissingUnitCostsCsv({products:[product],receptions:[],
      units:[unit("u1","IMEI-001","en_bodega"),unit("u2","IMEI-002","vendido"),
        unit("u3","IMEI-003","en_bodega",3000)]});
    expect(csv).toContain("IMEI-001");
    expect(csv).not.toContain("IMEI-002");
    expect(csv).not.toContain("IMEI-003");
  });
  it("neutraliza valores que Excel interpretaría como fórmulas",()=>{
    const csv=buildMissingUnitCostsCsv({products:[{...product,sku:"=1+2"}],receptions:[],
      units:[unit("u1","IMEI-001","en_bodega")]});
    expect(csv).not.toContain(';"=1+2"');
    expect(csv).toContain("'=1+2");
  });
});
