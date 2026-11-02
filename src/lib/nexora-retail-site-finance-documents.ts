/** Exportables del informe retail ya validado. No mezclar con movimientos intersede. */
import { parseRetailSiteFinancialReport, calculateRetailReportTotals,
  type RetailSiteFinancialReport } from "./nexora-retail-site-finance";
export const safeFinancialExcelText = (text: string): string =>
  /^[\s]*[=+\-@\t\r\n]/.test(text) ? "'"+text : text;
export const buildRetailFinancialDocuments = (raw: RetailSiteFinancialReport) => {
  const report=parseRetailSiteFinancialReport(raw);
  const total=calculateRetailReportTotals(report.stores);
  const columns=["Ciudad","Local","IMEI vendidos","Ventas COP","Costo IMEI COP",
    "Margen bruto COP","Gastos COP","Margen menos gastos COP","Dif. arqueo COP"];
  const items=report.stores.map(site=>[
    safeFinancialExcelText(site.cityName),
    safeFinancialExcelText(site.siteName),
    site.unitsSold,site.revenue,site.unitCost,site.grossProfit,
    site.authorizedExpenses,site.grossAfterExpenses,site.closingDifference,
  ]);
  const rows:(string|number)[][]=[...items,["TOTAL",String(total.sites)+" locales",total.unitsSold,
    total.revenue,total.unitCost,total.grossProfit,total.authorizedExpenses,
    total.grossAfterExpenses,total.closingDifference]];
  const subtitle=report.from+" a "+report.to+" · COP · Solo ventas minoristas; no incluye transferencias entre sedes";
  const filename="nexora-finanzas-retail-"+report.from+"-"+report.to;
  return {title:"Informe financiero por sede",subtitle,filename,columns,rows,
    note:"Margen menos gastos no es utilidad neta. Excluye mayoristas, impuestos, divisas y transferencias internas."};
};
