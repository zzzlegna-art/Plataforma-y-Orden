/** Planilla administrativa de costos reales por IMEI; nunca escribe montos. */
import { safeCsvCell } from "./nexora-imei-unified-csv";
import type { Unit,Product,Reception } from "./types";
export interface CostTemplateData {
  units: readonly Unit[];
  products: readonly Product[];
  receptions: readonly Reception[];
}
export const buildMissingUnitCostsCsv=({units,products,receptions}:CostTemplateData):string=>{
  const prod=new Map(products.map(x=>[x.id,x]));
  const receipts=new Map(receptions.map(x=>[x.id,x.code]));
  const eligible=units.filter(u=>u.status!=="vendido"&&
    (u.cost===undefined||u.cost===null||!Number.isFinite(u.cost)||u.cost<=0));
  const head=[
    ["NEXORA · SOPORTES DE COSTO INDIVIDUAL · SOLO ADMINISTRADOR"],
    ["AVISO","No se asumió ningún costo ni precio de catálogo. Los importes se deben acreditar con factura real de recepción."],
    ["AVISO","Completar costo_real_cop por IMEI, adjuntar referencia de factura y verificar antes de cualquier actualización autorizada."],
    ["AVISO","Este CSV NO se importa automáticamente a la plataforma ni modifica inventario."],
    [],
    ["IMEI","SKU","Producto","Recepción","Costo real COP (llenar)","Factura o comprobante real (llenar)","Revisado por (llenar)","Observaciones"],
  ];
  const rows=eligible.map(u=>[
    u.serial,prod.get(u.productId)?.sku??"",prod.get(u.productId)?.name??"",
    u.receptionId?receipts.get(u.receptionId)??"SIN RECEPCIÓN":"SIN RECEPCIÓN",
    "","","","",
  ]);
  return "\uFEFF"+[...head,...rows].map(row=>row.map(x=>safeCsvCell(x)).join(";")).join("\r\n")+"\r\n";
};
