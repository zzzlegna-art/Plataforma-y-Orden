import { describe,expect,it } from "vitest";
import { buildCostEvidenceCsv,parseCostEvidenceReport } from "./nexora-cost-evidence";

const first=()=>({
  receptionId:"11111111-1111-4111-8111-111111111111",
  receptionCode:"REC-00001",receiptReference:null,receiptStatus:"confirmada",
  receivedAt:"2026-10-27T09:00:00Z",supplierName:null,
  eligible:1350,withoutCost:1350,withCost:0,referencesCount:16,
});
const second=()=>({
  receptionId:"22222222-2222-4222-8222-222222222222",
  receptionCode:"REC-00002",receiptReference:null,receiptStatus:"confirmada",
  receivedAt:"2026-10-27T09:00:00Z",supplierName:"+Proveedor Azul",
  eligible:755,withoutCost:755,withCost:0,referencesCount:16,
});
const data=()=>({
  scope:"cost_recovery_evidence_only",snapshotAt:"2026-11-02T21:00:00Z",
  eligible:2105,withoutCost:2105,withCost:0,receipts:2,items:[first(),second()],
});
describe("Nexora · soporte documental de costos por recepción",()=>{
  it("prioriza recepciones reales sin convertirlas en prueba de costo",()=>{
    const parsed=parseCostEvidenceReport(data());
    expect(parsed.withoutCost).toBe(2105);
    expect(parsed.items[0].receptionCode).toBe("REC-00001");
    expect(parsed.items[0].supplierName).toBeNull();
  });
  it("rechaza recepciones duplicadas y conteos falsos",()=>{
    expect(()=>parseCostEvidenceReport({...data(),items:[first(),first()]})).toThrow();
    expect(()=>parseCostEvidenceReport({...data(),receipts:3})).toThrow();
    expect(()=>parseCostEvidenceReport({...data(),withoutCost:2104})).toThrow();
    expect(()=>parseCostEvidenceReport({...data(),items:[second(),first()]})).toThrow();
    expect(()=>parseCostEvidenceReport({...data(),items:[{...first(),withCost:1},second()]})).toThrow();
  });
  it("exige recepción válida, fecha y resumen consistente",()=>{
    expect(()=>parseCostEvidenceReport({...data(),items:[{...first(),receivedAt:"no-es-fecha"},second()]})).toThrow();
    expect(()=>parseCostEvidenceReport({...data(),items:[{...first(),receptionId:null},second()]})).toThrow();
    expect(()=>parseCostEvidenceReport({...data(),items:[]})).toThrow();
  });
  it("genera CSV UTF-8 con notas de no estimar costos y texto antifórmulas",()=>{
    const input=data();
    input.items[0].receiptReference="=IMPORTXML(A1)";
    const csv=buildCostEvidenceCsv(parseCostEvidenceReport(input));
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(`"'=IMPORTXML(A1)"`);
    expect(csv).toContain(`"'+Proveedor Azul"`);
    expect(csv).toContain("No imputar costos por promedio");
    expect(csv).toContain("Número de factura real");
    expect(csv).toContain("REC-00001");
  });
  it("admite estado real vacío sin inventar filas de recepción",()=>{
    const empty={...data(),eligible:0,withoutCost:0,receipts:0,items:[]};
    const parsed=parseCostEvidenceReport(empty);
    expect(parsed.items).toEqual([]);
    expect(buildCostEvidenceCsv(parsed)).not.toContain("REC-00001");
  });
});
