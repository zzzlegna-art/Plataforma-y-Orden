import { describe,expect,it } from "vitest";
import { checkDispatchOperation,type DispatchStatusClient } from "./nexora-transfer-dispatch-check";

const doc={id:"t1",code:"TRA-001",kind:"envio",status:"en_transito",
  origin_site_id:"b1",destination_site_id:"l1"};
const api=(document:unknown, units:unknown, error?:{message:string;code?:string})=>( {
  from:(table:string)=>({
    select:(_fields:string)=>{
      const q={
        eq:(_key:string,_value:string)=>q,
        limit:(_size:number)=>q,
        maybeSingle:()=>q,
        then:<T>(done:(data:{data:unknown;error:{message:string;code?:string}|null})=>T)=>
          Promise.resolve(done({data:table==="nexora_transfers"?document:units,error:error??null})),
      };
      return q;
    },
  }),
}) as unknown as DispatchStatusClient;
const args={transferId:"t1",originId:"b1",destinationId:"l1",
  unitIds:["i1","i2"]};

describe("Verificación segura de despacho tras corte de red",()=>{
  it("si no existe la operación permite repetir solamente el UUID previo",async()=>{
    expect(await checkDispatchOperation({...args,client:api(null,null)})).toEqual({result:"absent"});
  });
  it("reconoce la confirmación de despacho con los mismos IMEI",async()=>{
    expect(await checkDispatchOperation({...args,client:api(doc,[
      {unit_id:"i2"},{unit_id:"i1"},
    ])})).toEqual({result:"confirmed",code:"TRA-001",status:"en_transito"});
  });
  it("no permite reconocer un manifiesto distinto",async()=>{
    await expect(checkDispatchOperation({...args,client:api(doc,[{unit_id:"i3"}])}))
      .rejects.toThrow(/no coincide/);
  });
  it("no permite dar por confirmado un documento con destino cambiado",async()=>{
    await expect(checkDispatchOperation({...args,client:api({...doc,destination_site_id:"otro"},[
      {unit_id:"i1"},{unit_id:"i2"},
    ])})).rejects.toThrow(/documento diferente/);
  });
  it("ante error de lectura o servidor no aconseja repetir el envío",async()=>{
    await expect(checkDispatchOperation({...args,client:api(null,null,{message:"Network"})}))
      .rejects.toThrow(/No se pudo comprobar/);
  });
});
