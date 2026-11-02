import { describe,expect,it } from "vitest";
import { buildRetailSiteFinancialCsv } from "./nexora-retail-site-finance-csv";
import { parseRetailSiteFinancialReport } from "./nexora-retail-site-finance";

const sample=()=>parseRetailSiteFinancialReport({
  scope:"retail_only_confirmed",timezone:"America/Bogota",from:"2026-11-01",to:"2026-11-02",
  stores:[{
    siteId:"store-1",cityName:"=IMPORTXML(A1)",siteName:"+Local Norte",active:true,
    sessions:2,openSessions:0,closedSessions:2,closingDifference:-2500.25,
    unitsSold:2,revenue:3500000.25,unitCost:3000000.25,grossProfit:500000,
    cashRevenue:1500000,transferRevenue:2000000.25,
    authorizedExpenses:70000.5,grossAfterExpenses:429999.5,
  }],
});

describe("Nexora · exportación financiera CSV por sede",()=>{
  it("exporta importes reales, detalle de caja y totales con decimales exactos",()=>{
    const csv=buildRetailSiteFinancialCsv(sample());
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"3500000.25"');
    expect(csv).toContain('"3000000.25"');
    expect(csv).toContain('"429999.50"');
    expect(csv).toContain('"-2500.25"');
    expect(csv).toContain('"TOTAL"');
    expect(csv).toContain('"2"');
  });
  it("no ejecuta fórmulas insertadas como nombre de local o ciudad",()=>{
    const csv=buildRetailSiteFinancialCsv(sample());
    expect(csv).toContain(`"'=IMPORTXML(A1)"`);
    expect(csv).toContain(`"'+Local Norte"`);
    expect(csv).not.toContain('";=IMPORTXML');
  });
  it("tolera informes vacíos sin generar ventas ficticias",()=>{
    const csv=buildRetailSiteFinancialCsv({...sample(),stores:[]});
    expect(csv).toContain('"TOTAL";"0 locales"');
    expect(csv).not.toContain("Local Norte");
  });
  it("bloquea un período o un ámbito financiero no verificados",()=>{
    expect(()=>buildRetailSiteFinancialCsv({...sample(),scope:"wholesale_all"} as never)).toThrow();
    expect(()=>buildRetailSiteFinancialCsv({...sample(),from:"2020-01-01"})).toThrow();
  });
});
