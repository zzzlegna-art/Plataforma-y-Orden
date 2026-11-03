import { describe, expect, it } from "vitest";
import { reconcileReceiverNotes } from "./nexora-transfer-receiver-notes";
import type { TransferMissingAudit } from "./nexora-transfer-missing-audit";

const generic:TransferMissingAudit={
  state:"verified",
  entries:Array.from({length:5},(_,i)=>({
    lineId:`l${16+i}`,unitId:`u${16+i}`,
    serial:`IMEI-00${16+i}`,observation:"No llegó" as const,
    reportedBy:"admin",reportedAt:"2026-11-03T12:00:00Z",
  })),
};
const notes = generic.entries.map((entry,i)=>({
  transfer_line_id:entry.lineId,serial_snapshot:entry.serial,
  receiver_observation:`El receptor revisó la caja y no apareció la unidad ${i+16}.`,
  recorded_by:"admin",recorded_at:"2026-11-03T12:00:00Z",
}));

describe("Nexora V4 · cotejo de notas individuales realmente persistidas",()=>{
  it("certifica cinco notas únicamente con cinco incidentes reales asociados",()=>{
    const result=reconcileReceiverNotes(notes,generic,5);
    expect(result.state).toBe("verified");
    expect(result.entries).toHaveLength(5);
    expect(result.entries[0].observation).toContain("no apareció");
  });
  it("conserva el estado pendiente o inaccesible, nunca inventa notas",()=>{
    expect(reconcileReceiverNotes([],generic,5).state).toBe("incomplete");
    expect(reconcileReceiverNotes(notes,{state:"unavailable",entries:[]},5).state)
      .toBe("unavailable");
    expect(reconcileReceiverNotes(notes,{state:"incomplete",entries:[]},5).state)
      .toBe("incomplete");
  });
  it("rechaza notas duplicadas, ajenas, editadas o sin autor y fecha",()=>{
    const changed=[
      [...notes.slice(0,4),notes[0]],
      notes.map((r,i)=>i===0?{...r,serial_snapshot:"IMEI-AJENO"}:r),
      notes.map((r,i)=>i===0?{...r,receiver_observation:"  "}:r),
      notes.map((r,i)=>i===0?{...r,recorded_by:""}:r),
      notes.map((r,i)=>i===0?{...r,recorded_by:"otro-usuario"}:r),
      notes.map((r,i)=>i===0?{...r,recorded_at:"fecha imposible"}:r),
    ];
    for(const sample of changed){
      expect(reconcileReceiverNotes(sample,generic,5).state).toBe("incomplete");
    }
  });
  it("no exige notas cuando no existe ningún faltante",()=>{
    const none:TransferMissingAudit={state:"verified",entries:[]};
    expect(reconcileReceiverNotes([],none,null)).toEqual({state:"verified",entries:[]});
  });
});
