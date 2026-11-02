import { describe, expect, it } from "vitest";
import {
  groupDispatchSelection,loadDispatchSerials,loadDispatchCatalog,
  type DispatchReadClient,
} from "./nexora-transfer-dispatch";

const warehouse = { id:"b1",name:"Bodega de Prueba", city_id:"c1",kind:"bodega",
  parent_warehouse_id:null,is_active:true,code:"B1",address:null,
  created_at:"",created_by:null };
type Response = {data:unknown;error?:{message:string;code?:string}|null};
const makeClient=(values:Record<string,Response>) => ({
  from:(table:string)=>({
    select:(_fields:string)=>{
      const filter:Record<string,string>={};
      const q={
        eq:(key:string,val:string)=>{filter[key]=val;return q;},
        order:(_field:string)=>q,
        range:(start:number,end:number)=>{
          const rows=values[table]?.data;
          const array=Array.isArray(rows)?rows:[];
          state={...values[table],data:array.filter(row=>
            Object.entries(filter).every(([key,value])=>row[key]===value)).slice(start,end+1)};
          return q;
        },
        then:<T>(done:(value:Response)=>T)=>{
          return Promise.resolve(done(state??values[table]??{data:[],error:null}));
        },
      };
      let state:Response|null=null;
      return q;
    },
  }),
}) as unknown as DispatchReadClient;

describe("Inventario físico de origen en nuevo traslado",()=>{
  it("consulta solamente los IMEI disponibles de la sede y referencia",async()=>{
    const api=makeClient({bodega_units:{data:[
      {id:"i1",serial:"351",site_id:"b1",product_id:"p1",status:"en_bodega",color:"Azul"},
      {id:"i2",serial:"352",site_id:"b2",product_id:"p1",status:"en_bodega",color:"Azul"},
      {id:"i3",serial:"353",site_id:"b1",product_id:"p1",status:"en_transito",color:"Negro"},
      {id:"i4",serial:"354",site_id:"b1",product_id:"p2",status:"en_bodega",color:"Negro"},
    ]}});
    const selected=await loadDispatchSerials(warehouse,"p1",api);
    expect(selected.map(unit=>unit.serial)).toEqual(["351"]);
  });

  it("cambia el estado esperado de disponibilidad para locales",async()=>{
    const api=makeClient({bodega_units:{data:[
      {id:"i1",serial:"351",site_id:"l1",product_id:"p1",status:"en_local"},
      {id:"i2",serial:"352",site_id:"l1",product_id:"p1",status:"en_bodega"},
    ]}});
    const local={...warehouse,id:"l1",kind:"local",parent_warehouse_id:"b1"};
    expect((await loadDispatchSerials(local,"p1",api)).map(u=>u.id)).toEqual(["i1"]);
  });

  it("rechaza IMEI duplicados y ubicaciones no conciliadas",async()=>{
    const api=makeClient({bodega_units:{data:[
      {id:"i1",serial:"351",site_id:"b1",product_id:"p1",status:"en_bodega"},
      {id:"i2",serial:"351",site_id:"b1",product_id:"p1",status:"en_bodega"},
    ]}});
    await expect(loadDispatchSerials(warehouse,"p1",api)).rejects.toThrow(/duplicados/);
  });

  it("resume cantidades por modelo sin confundir IMEI",()=>{
    const groups=groupDispatchSelection([
      {id:"i1",serial:"351",product_id:"p1",color:null},
      {id:"i2",serial:"352",product_id:"p1",color:null},
      {id:"i3",serial:"353",product_id:"p2",color:null},
    ],[
      {id:"p1",name:"iPhone 13",sku:"IP13",is_active:true},
      {id:"p2",name:"iPhone 17",sku:"IP17",is_active:true},
    ]);
    expect(groups).toEqual([
      {productId:"p1",reference:"iPhone 13 · IP13",quantity:2},
      {productId:"p2",reference:"iPhone 17 · IP17",quantity:1},
    ]);
  });

  it("carga catálogo de ciudades, sedes y referencias",async()=>{
    const api=makeClient({
      nexora_sites:{data:[warehouse]},
      nexora_cities:{data:[{id:"c1",name:"Ciudad de Prueba"}]},
      bodega_products:{data:[{id:"p1",name:"iPhone 13",sku:"IP13",is_active:true}]},
    });
    const result=await loadDispatchCatalog(api);
    expect(result.sites).toHaveLength(1);
    expect(result.products[0].name).toBe("iPhone 13");
  });
});
