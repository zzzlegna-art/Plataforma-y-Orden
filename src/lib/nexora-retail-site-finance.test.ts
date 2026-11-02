import { describe,expect,it } from "vitest";
import {
  calculateRetailReportTotals,parseRetailSiteFinancialReport,
  validateRetailDateRange,validIsoDate,
} from "./nexora-retail-site-finance";

const example=()=>({
  scope:"retail_only_confirmed",timezone:"America/Bogota",
  from:"2026-11-01",to:"2026-11-02",stores:[
    {siteId:"local-1",siteName:"Local Centro",cityName:"Barranquilla",active:true,
      sessions:2,openSessions:0,closedSessions:2,closingDifference:-2500,
      unitsSold:2,revenue:3000000,unitCost:2500000,
      cashRevenue:1000000,transferRevenue:2000000,
      grossProfit:500000,authorizedExpenses:50000,grossAfterExpenses:450000},
    {siteId:"local-2",siteName:"Local Norte",cityName:"Barranquilla",active:true,
      sessions:0,openSessions:0,closedSessions:0,closingDifference:0,
      unitsSold:0,revenue:0,unitCost:0,cashRevenue:0,transferRevenue:0,
      grossProfit:0,authorizedExpenses:0,grossAfterExpenses:0},
  ],
});
describe("Nexora Multisede · reporte financiero minorista",()=>{
  it("cuadra costos reales, efectivo, transferencias y margen sin confundirlo con utilidad neta",()=>{
    const report=parseRetailSiteFinancialReport(example());
    const totals=calculateRetailReportTotals(report.stores);
    expect(totals.unitsSold).toBe(2);
    expect(totals.revenue).toBe(3000000);
    expect(totals.unitCost).toBe(2500000);
    expect(totals.grossProfit).toBe(500000);
    expect(totals.authorizedExpenses).toBe(50000);
    expect(totals.grossAfterExpenses).toBe(450000);
    expect(totals.closingDifference).toBe(-2500);
  });
  it("no inventa ventas cuando no existen sedes ni sesiones de caja",()=>{
    const report=parseRetailSiteFinancialReport({...example(),stores:[]});
    expect(report.stores).toHaveLength(0);
    expect(calculateRetailReportTotals(report.stores).revenue).toBe(0);
  });
  it("rechaza ventas sin respaldo del total recibido o margen incompatible",()=>{
    const e=example();e.stores[0].cashRevenue=1500000;
    expect(()=>parseRetailSiteFinancialReport(e)).toThrow();
    const f=example();f.stores[0].grossProfit=200000;
    expect(()=>parseRetailSiteFinancialReport(f)).toThrow();
    const g=example();g.stores[0].grossAfterExpenses=999999;
    expect(()=>parseRetailSiteFinancialReport(g)).toThrow();
  });
  it("rechaza estados de caja, cifras inválidas y locales repetidos",()=>{
    const e=example();e.stores[0].sessions=1;
    expect(()=>parseRetailSiteFinancialReport(e)).toThrow();
    const f=example();f.stores[0].unitsSold=-1;
    expect(()=>parseRetailSiteFinancialReport(f)).toThrow();
    const g=example();g.stores[1].siteId="local-1";
    expect(()=>parseRetailSiteFinancialReport(g)).toThrow();
    expect(()=>parseRetailSiteFinancialReport({...example(),scope:"all_finances"})).toThrow();
  });
  it("limita el rango a 366 días y valida fechas reales",()=>{
    expect(validIsoDate("2026-02-30")).toBe(false);
    expect(validIsoDate("2024-02-29")).toBe(true);
    expect(validateRetailDateRange("2026-11-02","2026-11-01")).not.toBeNull();
    expect(validateRetailDateRange("2025-01-01","2026-11-02")).not.toBeNull();
    expect(validateRetailDateRange("2026-11-01","2026-11-02")).toBeNull();
  });
});
