/** Reporte financiero minorista exportable para auditoría, sin datos simulados. */
import { safeCsvCell } from "./nexora-imei-unified-csv";
import {
  calculateRetailReportTotals,
  type RetailSiteFinancialReport,
  validateRetailDateRange,
} from "./nexora-retail-site-finance";

const amount=(n:number):string=>{
  if(!Number.isFinite(n)||Math.abs(n)>1e15)
    throw new Error("Importe financiero no válido para exportar.");
  return n.toFixed(2);
};

export const buildRetailSiteFinancialCsv=(report:RetailSiteFinancialReport):string=>{
  if(report.scope!=="retail_only_confirmed"
    ||report.timezone!=="America/Bogota"
    ||validateRetailDateRange(report.from,report.to)
    ||report.stores.length>200)
    throw new Error("El reporte no está autorizado para exportación.");

  const rows:string[][]=[
    ["Nexora Multisede · Reporte histórico financiero minorista"],
    ["Desde",report.from,"Hasta",report.to],
    ["Zona horaria",report.timezone],
    ["Alcance","Solo ventas retail confirmadas, costo IMEI y gastos de caja"],
    ["Aviso","Margen menos gastos NO es utilidad neta; excluye mayoristas, impuestos y transferencias contables"],
    [],
    ["Ciudad","Local","Estado de sede","IMEI vendidos","Jornadas","Cajas abiertas",
      "Ingreso efectivo COP","Ingreso transferencia COP","Ingresos retail COP",
      "Costo real IMEI COP","Margen bruto COP","Gastos autorizados COP",
      "Margen menos gastos COP","Diferencia arqueo COP"],
  ];
  for(const site of report.stores){
    rows.push([
      site.cityName,site.siteName,site.active?"Activa":"Inactiva",
      String(site.unitsSold),String(site.sessions),String(site.openSessions),
      amount(site.cashRevenue),amount(site.transferRevenue),amount(site.revenue),
      amount(site.unitCost),amount(site.grossProfit),amount(site.authorizedExpenses),
      amount(site.grossAfterExpenses),amount(site.closingDifference),
    ]);
  }
  const total=calculateRetailReportTotals(report.stores);
  rows.push([
    "TOTAL",String(total.sites)+" locales","",
    String(total.unitsSold),String(total.sessions),String(total.openSessions),
    amount(total.cashRevenue),amount(total.transferRevenue),amount(total.revenue),
    amount(total.unitCost),amount(total.grossProfit),amount(total.authorizedExpenses),
    amount(total.grossAfterExpenses),amount(total.closingDifference),
  ]);
  return "\uFEFF"+rows.map(row=>row.map(value=>safeCsvCell(value)).join(";")).join("\r\n")+"\r\n";
};
