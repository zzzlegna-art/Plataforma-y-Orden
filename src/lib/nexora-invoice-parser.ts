/** Captura asistida: OCR y reglas conservadoras. Nunca confirma costos ni stock. */
export interface InvoiceLineSuggestion {
  description:string; quantity:number; unitCost:number|null; total:number|null;
  productId:string|null; sku:string|null; warning?:string;
}
export interface InvoiceSuggestion {
  supplierName:string;invoiceNo:string;invoiceDate:string;currency:"COP"|"USD"|"EUR"|"OTRA";
  lines:InvoiceLineSuggestion[];warnings:string[];rawText:string;
}
export interface CatalogMatch {id:string;sku:string;name:string;}
const normalized=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toUpperCase().replace(/[^A-Z0-9]+/g," ").trim().replace(/\s+/g," ");
export const readMoney=(input:string):number|null=>{
  let s=input.replace(/[^\d.,-]/g,"").trim();
  if(!s||!/\d/.test(s)||s.startsWith("-"))return null;
  const comma=s.lastIndexOf(","),dot=s.lastIndexOf(".");
  if(comma>=0&&dot>=0){
    const decimal=comma>dot?",":".";
    const other=decimal===","?".":",";
    s=s.replaceAll(other,"").replace(decimal,".");
  }else{
    const last=Math.max(comma,dot);
    if(last>=0){
      const right=s.length-last-1;
      const separator=s[last];
      const multiple=s.split(separator).length>2;
      if(right===3||multiple)s=s.replaceAll(separator,"");
      else s=s.replace(separator,".");
    }
  }
  const amount=Number(s);
  return Number.isFinite(amount)&&amount>0&&amount<1e12?amount:null;
};
const dateValue=(text:string):string=>{
  const m=/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  const n=/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/.exec(text);
  const parts=m?[Number(m[1]),Number(m[2]),Number(m[3])]:n?[Number(n[3]),Number(n[2]),Number(n[1])]:null;
  if(!parts)return "";
  const [y,mo,d]=parts;
  if(mo<1||mo>12||d<1||d>31)return "";
  const test=new Date(Date.UTC(y,mo-1,d));
  return test.getUTCFullYear()===y&&test.getUTCMonth()===mo-1&&test.getUTCDate()===d
    ?`${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`:"";
};

/** Reconoce filas con descripción antes o después de la cantidad.
 * Si falta un dato, nunca infiere un costo del total general. */
const readItemRow=(row:string):{description:string;quantity:number;cost:number|null;total:number|null}|null=>{
  const formats=[
    /^(\d{1,4})\s+(.{4,140}?)\s+([$€]?\s*\d[\d.,]*)\s+([$€]?\s*\d[\d.,]*)\s*$/,
    /^(.{4,140}?)\s+(\d{1,4})\s+([$€]?\s*\d[\d.,]*)\s+([$€]?\s*\d[\d.,]*)\s*$/,
  ];
  for(let index=0;index<formats.length;index++){
    const match=formats[index].exec(row);
    if(!match)continue;
    const description=(index===0?match[2]:match[1]).trim();
    const quantity=Number(index===0?match[1]:match[2]);
    const cost=readMoney(match[3]);
    const total=readMoney(match[4]);
    if(!/[a-zA-ZÁÉÍÓÚÑáéíóúñ]/.test(description)
       ||!Number.isSafeInteger(quantity)||quantity<1||quantity>10000)continue;
    return {description,quantity,cost,total};
  }
  return null;
};

export const parseInvoiceText=(input:string,products:readonly CatalogMatch[]):InvoiceSuggestion=>{
  const rawText=input.slice(0,35000);
  const rows=rawText.split(/\r?\n/).map(s=>s.replace(/\s+/g," ").trim()).filter(Boolean);
  const first=rows.slice(0,20).join(" \n ");
  const invo=/(?:FACTURA(?:\s+ELECTR[OÓ]NICA)?|INVOICE|N[UÚ]MERO|NO[.]?|N[°º#])\s*(?::|N[°º#.]?|NUMBER)?\s*([A-Z]{1,8}-?\d{3,14})\b/i.exec(first);
  const number=invo?.[1]??(/\b(FE-\d{3,14})\b/i.exec(first)?.[1]??"");
  const currency=/\bUSD\b|D[OÓ]LARES|US\$/i.test(rawText)?"USD"
    :/\bEUR\b|EUROS|€/i.test(rawText)?"EUR"
    :/\bCOP\b|PESOS|\bCOL\$|S[ÍI]MBOLO\s*\$/i.test(rawText)?"COP":"COP";
  const candidate=rows.find(l=>/^(?:PROVEEDOR|EMISOR|VENDOR|SUPPLIER)\s*[:–-]/i.test(l));
  const supplierName=candidate?.replace(/^(?:PROVEEDOR|EMISOR|VENDOR|SUPPLIER)\s*[:–-]\s*/i,"").trim()
    ||rows.find(l=>/[A-Za-zÁÉÍÓÚÑ]/.test(l)&&!/^(FACTURA|INVOICE|NIT|FECHA|DATE|N[°º]|TEL|DIRECCI)/i.test(l))||"";
  const lines:InvoiceLineSuggestion[]=[];
  const warnings:string[]=[];
  for(const row of rows){
    if(lines.length>=250)break;
    if(/(?:^|\s)(TOTAL|SUBTOTAL|IVA|IMPUEST|DESCUENTO|NIT|FACTURA|FECHA|TEL[ÉE]FONO|DIRECCI[OÓ]N)(?:\s|:|$)/i.test(row))continue;
    const item=readItemRow(row);
    if(!item)continue;
    const {description,quantity,cost,total}=item;
    const key=normalized(description);
    const hits=products.filter(p=>{
      const sku=normalized(p.sku);
      return normalized(p.name)===key||Boolean(sku&&(" "+key+" ").includes(" "+sku+" "));
    }).slice(0,2);
    const match=hits.length===1?hits[0]:null;
    const problems=[];
    if(!match)problems.push(hits.length>1?"Coincidencia ambigua":"Referencia sin coincidencia exacta");
    if(cost===null)problems.push("Costo ilegible");
    if(total===null)problems.push("Subtotal ilegible; verificar factura");
    else if(total!==null&&Math.abs(quantity*cost-total)>Math.max(2,total*.02))
      problems.push("Cantidad × costo no coincide con total");
    lines.push({description,quantity,unitCost:cost,total,productId:match?.id??null,
      sku:match?.sku??null,warning:problems.join("; ")||undefined});
  }
  if(!number)warnings.push("Revisar número de factura");
  if(!dateValue(first))warnings.push("Revisar fecha");
  if(!supplierName)warnings.push("Revisar proveedor");
  if(!lines.length)warnings.push("No se identificaron líneas completas: ingrésalas manualmente");
  if(lines.some(l=>l.warning))warnings.push("Hay referencias o importes pendientes de validación");
  return {supplierName,invoiceNo:number,invoiceDate:dateValue(first),
    currency,lines,warnings,rawText};
};

/** Validación previa a la firma del Administrador; el servidor vuelve a comprobarlo. */
export const validateInvoiceApproval=(
  lines:readonly InvoiceLineSuggestion[],supplierId:string,invoiceNo:string,
):string[]=>{
  const errors:string[]=[];
  if(!supplierId)errors.push("Selecciona un proveedor del catálogo.");
  if(!invoiceNo.trim())errors.push("Escribe el número de la factura.");
  if(!lines.length)errors.push("Incluye las referencias facturadas.");
  for(const [index,line] of lines.entries()){
    const label="Línea "+(index+1);
    if(!line.productId)errors.push(label+": selecciona una referencia.");
    if(!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>10000)
      errors.push(label+": cantidad inválida.");
    if(line.unitCost===null||!Number.isFinite(line.unitCost)||line.unitCost<=0)
      errors.push(label+": falta costo válido.");
    if(line.total!==null&&(!Number.isFinite(line.total)||line.total<=0))
      errors.push(label+": subtotal inválido.");
    if(line.total!==null&&line.unitCost!==null&&Number.isFinite(line.unitCost)&&
      Math.abs(line.quantity*line.unitCost-line.total)>Math.max(2,line.total*.02))
      errors.push(label+": la cantidad por costo no coincide con el subtotal; corrige antes de aprobar.");
  }
  return errors;
};
