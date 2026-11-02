import { describe,expect,it } from "vitest";
import { buildRetailFinancialDocuments,safeFinancialExcelText } from "./nexora-retail-site-finance-documents";
import type { RetailSiteFinancialReport } from "./nexora-retail-site-finance";
const empty:RetailSiteFinancialReport={scope:"retail_only_confirmed",timezone:"America/Bogota",
  from:"2026-11-01",to:"2026-11-02",stores:[]};
describe("exports PDF y Excel · informes retail V4",()=>{
  it("no inventa ventas para períodos vacíos",()=>{
    const result=buildRetailFinancialDocuments(empty);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0][3]).toBe(0);
    expect(result.subtitle).toContain("no incluye transferencias");
  });
  it("bloquea el contenido que podría ser fórmula de Excel",()=>{
    expect(safeFinancialExcelText("=HYPERLINK(\"malicious\")")).toMatch(/^'/);
    expect(safeFinancialExcelText("+SUM(1,2)")).toMatch(/^'/);
    expect(safeFinancialExcelText("Barranquilla")).toBe("Barranquilla");
  });
  it("rechaza períodos y reportes corruptos",()=>{
    expect(()=>buildRetailFinancialDocuments({...empty,to:"2026-10-01"})).toThrow();
    expect(()=>buildRetailFinancialDocuments({...empty,scope:"unsafe" as "retail_only_confirmed"})).toThrow();
  });
  it("conserva el alcance retail, moneda y nombres",()=>{
    const report={...empty,stores:[{siteId:"s1",siteName:"Local uno",cityName:"Barranquilla",
      active:true,sessions:1,openSessions:0,closedSessions:1,closingDifference:0,unitsSold:1,
      revenue:400000,unitCost:300000,cashRevenue:400000,transferRevenue:0,
      grossProfit:100000,authorizedExpenses:5000,grossAfterExpenses:95000}]};
    const d=buildRetailFinancialDocuments(report);
    expect(d.rows[0][1]).toBe("Local uno");
    expect(d.rows[1][7]).toBe(95000);
    expect(d.columns).toContain("Costo IMEI COP");
  });
});
