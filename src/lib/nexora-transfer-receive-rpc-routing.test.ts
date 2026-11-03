import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { runNexoraTransferAction } from "./nexora-transfers";

vi.mock("@/integrations/supabase/client",()=>({
  supabase:{ rpc:vi.fn() },
}));

const rpc = (supabase as unknown as {rpc: ReturnType<typeof vi.fn>}).rpc;

const marks = [
  { lineId:"l16",serial:"IMEI-0016",markedNotArrived:true,observation:"No se recibió en destino la unidad 16." },
  { lineId:"l17",serial:"IMEI-0017",markedNotArrived:true,observation:"El receptor verificó ausencia de unidad 17." },
];

describe("Nexora V4 · ruta RPC segura de recepción con notas",()=>{
  beforeEach(()=>{rpc.mockReset();});

  it("solo envía una recepción con notas a la nueva RPC transaccional",async()=>{
    rpc.mockResolvedValue({data:{
      transferId:"transfer-1",status:"awaiting_returns",
      received:1,missing:2,observationsRecorded:2,
    },error:null});

    const result=await runNexoraTransferAction({
      action:"receive",transferId:"transfer-1",
      serials:["IMEI-0015"],missingMarks:marks,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("nexora_transfer_receive_with_notes",{
      p_transfer_id:"transfer-1",
      p_received_serials:["IMEI-0015"],
      p_missing_marks:marks,
    });
    expect(result).toMatchObject({
      status:"awaiting_returns",received:1,missing:2,observationsRecorded:2,
    });
  });

  it("bloquea una recepción sin estructura de notas antes de llamar a Supabase",async()=>{
    await expect(runNexoraTransferAction({
      action:"receive",transferId:"transfer-1",serials:["IMEI-0015"],
    })).rejects.toThrow(/confirmaciones individuales/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("mantiene dispatch, cancel y otros eventos en la RPC legacy",async()=>{
    rpc.mockResolvedValue({data:{transferId:"transfer-1",status:"in_transit",sent:3},error:null});
    const result=await runNexoraTransferAction({
      action:"dispatch",transferId:"transfer-1",serials:[],
    });
    expect(result.status).toBe("in_transit");
    expect(rpc).toHaveBeenCalledWith("nexora_transfer_action",
      expect.objectContaining({p_action:"dispatch",p_transfer_id:"transfer-1"}));
  });

  it("propaga fallos del servidor sin presentar una recepción confirmada",async()=>{
    rpc.mockResolvedValue({data:null,error:{message:"Falta la casilla No llegó."}});
    await expect(runNexoraTransferAction({
      action:"receive",transferId:"transfer-1",serials:[],missingMarks:marks,
    })).rejects.toThrow(/Falta la casilla/);
  });
});
