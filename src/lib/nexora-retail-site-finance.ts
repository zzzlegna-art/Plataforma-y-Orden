/** Finanzas minoristas multisede: consulta de solo lectura, no reemplaza contabilidad. */
export interface RetailSiteFinancialRow {
  siteId:string;siteName:string;cityName:string;active:boolean;
  sessions:number;openSessions:number;closedSessions:number;
  closingDifference:number;unitsSold:number;
  revenue:number;unitCost:number;cashRevenue:number;transferRevenue:number;
  grossProfit:number;authorizedExpenses:number;grossAfterExpenses:number;
}
export interface RetailSiteFinancialReport {
  scope:"retail_only_confirmed";timezone:"America/Bogota";
  from:string;to:string;stores:RetailSiteFinancialRow[];
}
type MoneyKey="closingDifference"|"revenue"|"unitCost"|"cashRevenue"|"transferRevenue"|"grossProfit"|"authorizedExpenses"|"grossAfterExpenses";
type CountKey="sessions"|"openSessions"|"closedSessions"|"unitsSold";
const monetary:readonly MoneyKey[]=[
  "closingDifference","revenue","unitCost","cashRevenue","transferRevenue",
  "grossProfit","authorizedExpenses","grossAfterExpenses",
];
const counts:readonly CountKey[]=["sessions","openSessions","closedSessions","unitsSold"];
const nonnegative:readonly MoneyKey[]=[
  "revenue","unitCost","cashRevenue","transferRevenue","grossProfit","authorizedExpenses",
];
const record=(v:unknown):Record<string,unknown>=>{
  if(v===null||typeof v!=="object"||Array.isArray(v))
    throw new Error("Reporte minorista con formato inválido.");
  return v as Record<string,unknown>;
};
const text=(v:unknown)=>{
  if(typeof v!=="string"||v.trim().length===0||v.length>250)
    throw new Error("El reporte omite una sede o ciudad.");
  return v;
};
const money=(v:unknown)=>{
  if(typeof v!=="number"||!Number.isFinite(v)||Math.abs(v)>1e15)
    throw new Error("Importes minoristas inválidos.");
  return v;
};
const count=(v:unknown)=>{
  if(typeof v!=="number"||!Number.isSafeInteger(v)||v<0)
    throw new Error("Conteos minoristas inválidos.");
  return v;
};
const cents=(v:number)=>Math.round(v*100);
export const validIsoDate=(s:string)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(s+"T00:00:00Z");
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;
};
export const validateRetailDateRange=(from:string,to:string):string|null=>{
  if(!validIsoDate(from)||!validIsoDate(to))
    return "Selecciona dos fechas válidas.";
  const days=Math.round((Date.parse(to)-Date.parse(from))/86_400_000);
  if(days<0)return "La fecha inicial no puede ser posterior a la final.";
  if(days>365)return "El intervalo máximo es de 366 días inclusivos.";
  return null;
};

export const parseRetailSiteFinancialReport=(raw:unknown):RetailSiteFinancialReport=>{
  const r=record(raw);
  if(r.scope!=="retail_only_confirmed"||r.timezone!=="America/Bogota"
    ||typeof r.from!=="string"||typeof r.to!=="string"
    ||validateRetailDateRange(r.from,r.to)||!Array.isArray(r.stores)||r.stores.length>200)
    throw new Error("El reporte no corresponde a un período minorista verificado.");
  const sites=new Set<string>();
  const stores=r.stores.map((source:unknown):RetailSiteFinancialRow=>{
    const v=record(source);
    const siteId=text(v.siteId);
    if(sites.has(siteId)||typeof v.active!=="boolean")
      throw new Error("El reporte contiene locales duplicados o sin estado.");
    sites.add(siteId);
    const row={siteId,siteName:text(v.siteName),cityName:text(v.cityName),
      active:v.active} as RetailSiteFinancialRow;
    for(const key of counts)row[key]=count(v[key]);
    for(const key of monetary)row[key]=money(v[key]);
    if(nonnegative.some(key=>row[key]<0)
      ||row.sessions!==row.openSessions+row.closedSessions
      ||cents(row.revenue)!==cents(row.cashRevenue+row.transferRevenue)
      ||cents(row.grossProfit)!==cents(row.revenue-row.unitCost)
      ||cents(row.grossAfterExpenses)!==cents(row.grossProfit-row.authorizedExpenses))
      throw new Error("El reporte minorista contiene saldos inconsistentes.");
    return row;
  });
  return {scope:"retail_only_confirmed",timezone:"America/Bogota",
    from:r.from,to:r.to,stores};
};

export const calculateRetailReportTotals=(stores:readonly RetailSiteFinancialRow[])=>
  stores.reduce((acc,store)=>({
    sites:acc.sites+1,
    unitsSold:acc.unitsSold+store.unitsSold,
    sessions:acc.sessions+store.sessions,
    openSessions:acc.openSessions+store.openSessions,
    revenue:acc.revenue+store.revenue,
    cashRevenue:acc.cashRevenue+store.cashRevenue,
    transferRevenue:acc.transferRevenue+store.transferRevenue,
    unitCost:acc.unitCost+store.unitCost,
    grossProfit:acc.grossProfit+store.grossProfit,
    authorizedExpenses:acc.authorizedExpenses+store.authorizedExpenses,
    grossAfterExpenses:acc.grossAfterExpenses+store.grossAfterExpenses,
    closingDifference:acc.closingDifference+store.closingDifference,
  }),{sites:0,unitsSold:0,sessions:0,openSessions:0,revenue:0,cashRevenue:0,
    transferRevenue:0,unitCost:0,grossProfit:0,authorizedExpenses:0,
    grossAfterExpenses:0,closingDifference:0});

export const fetchRetailSiteFinancialReport=async (
  from:string,to:string,
):Promise<RetailSiteFinancialReport>=>{
  const invalid=validateRetailDateRange(from,to);
  if(invalid)throw new Error(invalid);
  const {supabase}=await import("@/integrations/supabase/client");
  const {data,error}=await (supabase as unknown as {
    rpc:(name:string,args:Record<string,unknown>)=>Promise<{
      data:unknown;error:{message:string}|null;
    }>;
  }).rpc("nexora_retail_site_financial_report",{
    p_from:from,p_to:to,
  });
  if(error)throw new Error(error.message);
  return parseRetailSiteFinancialReport(data);
};
