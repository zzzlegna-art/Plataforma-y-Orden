import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowLeft,FileSearch,FileUp,Plus,RefreshCw,ShieldCheck,Trash2} from "lucide-react";
import {Link,useNavigate} from "react-router-dom";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {useStore} from "@/hooks/use-store";
import {useApp} from "@/hooks/use-app";
const getClient=async()=> (await import("@/integrations/supabase/client")).supabase;
import {listSuppliers,type Supplier} from "@/lib/suppliers";
import {parseInvoiceText,type InvoiceSuggestion,type InvoiceLineSuggestion} from "@/lib/nexora-invoice-parser";
import {readInvoiceDocument} from "@/lib/nexora-invoice-reader";

type InvoiceStatus="pending"|"reviewed"|"prepared";
type InvoiceDraft={
 id:string;source_path:string;source_sha256:string;original_filename:string;
 supplier_name:string;supplier_id:string|null;invoice_no:string|null;invoice_date:string|null;
 currency:"COP"|"USD"|"EUR"|"OTRA";lines:InvoiceLineSuggestion[];
 warnings:string[];extracted_text:string;status:InvoiceStatus;
 reception_id:string|null;created_at:string;
};
type DbRow=Record<string,unknown>;
const parseDraft=(data:DbRow):InvoiceDraft=>({
 id:String(data.id),source_path:String(data.source_path),source_sha256:String(data.source_sha256),
 original_filename:String(data.original_filename),supplier_name:String(data.supplier_name??""),
 supplier_id:typeof data.supplier_id==="string"?data.supplier_id:null,
 invoice_no:typeof data.invoice_no==="string"?data.invoice_no:null,
 invoice_date:typeof data.invoice_date==="string"?data.invoice_date:null,
 currency:(["COP","USD","EUR","OTRA"].includes(String(data.currency))?data.currency:"COP") as InvoiceDraft["currency"],
 lines:Array.isArray(data.lines)?data.lines as InvoiceLineSuggestion[]:[],
 warnings:Array.isArray(data.warnings)?data.warnings as string[]:[],
 extracted_text:String(data.extracted_text??""),status:data.status as InvoiceStatus,
 reception_id:typeof data.reception_id==="string"?data.reception_id:null,
 created_at:String(data.created_at),
});
const money=(n:number|null)=>n===null?"Pendiente":new Intl.NumberFormat("es-CO",{maximumFractionDigits:2}).format(n);
const readHash=async(file:File)=>{
 const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()));
 return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
};
/** Se guarda el documento original, pero ninguna lectura crea mercancía. */
const InvoiceCapture=()=>{
 const {user,role}=useApp();
 const {db}=useStore();
 const navigate=useNavigate();
 const admin=role==="admin";
 const [suppliers,setSuppliers]=useState<Supplier[]>([]);
 const [drafts,setDrafts]=useState<InvoiceDraft[]>([]);
 const [file,setFile]=useState<File|null>(null);
 const [active,setActive]=useState<InvoiceDraft|null>(null);
 const [fields,setFields]=useState<InvoiceSuggestion|null>(null);
 const [supplierId,setSupplierId]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [loadingList,setLoadingList]=useState(true);
 const lock=useRef(false);
 const catalog=db.products.filter(x=>x.isActive);
 const load=useCallback(async()=>{
   setLoadingList(true);
   try{
     const supabase=await getClient();
     const [listed,providers]=await Promise.all([
       supabase.from("nexora_invoice_drafts").select("*").order("created_at",{ascending:false}).limit(30),
       listSuppliers(),
     ]);
     if(listed.error)throw new Error(listed.error.message);
     setDrafts((listed.data??[]).map(row=>parseDraft(row as DbRow)));
     setSuppliers(providers);
   }catch(e){toast.error(e instanceof Error?e.message:"No se pudieron consultar las facturas.");}
   finally{setLoadingList(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 const openDraft=(draft:InvoiceDraft)=>{
   setActive(draft);setFile(null);setError("");setMessage("");
   setSupplierId(draft.supplier_id??"");
   setFields({supplierName:draft.supplier_name,invoiceNo:draft.invoice_no??"",
     invoiceDate:draft.invoice_date??"",currency:draft.currency,lines:draft.lines,
     warnings:draft.warnings,rawText:draft.extracted_text});
 };
 const clear=()=>{setActive(null);setFile(null);setFields(null);setSupplierId("");setMessage("");setError("");};
 const readFile=async(selected:File)=>{
   clear();setFile(selected);
   if(lock.current)return;
   lock.current=true;setBusy(true);setError("");
   try{
     const text=await readInvoiceDocument(selected,setMessage);
     const result=parseInvoiceText(text,catalog.map(p=>({id:p.id,sku:p.sku,name:p.name})));
     setFields(result);
     const match=suppliers.filter(s=>s.name.trim().toLocaleLowerCase("es-CO")===
       result.supplierName.trim().toLocaleLowerCase("es-CO"));
     if(match.length===1)setSupplierId(match[0].id);
     setMessage(result.lines.length?
       "Lectura terminada. Revisa las coincidencias y los importes.":"Lectura terminada. Completa manualmente los datos ilegibles.");
   }catch(e){
     setFields(parseInvoiceText("",catalog.map(p=>({id:p.id,sku:p.sku,name:p.name}))));
     setError(e instanceof Error?e.message:"No se pudo leer el archivo.");
     setMessage("Puedes guardar la factura y completar la información manualmente.");
   }finally{setBusy(false);lock.current=false;}
 };
 const edit=(patch:Partial<InvoiceSuggestion>)=>setFields(p=>p?{...p,...patch}:null);
 const editLine=(index:number,patch:Partial<InvoiceLineSuggestion>)=>setFields(p=>p?{
   ...p,lines:p.lines.map((item,i)=>i===index?{...item,...patch,warning:undefined}:item),
 }:null);
 const save=async()=>{
   if(!file||!fields||!user||lock.current)return;
   if(!["application/pdf","image/jpeg","image/png"].includes(file.type)||file.size>10485760||file.size===0){
     setError("Selecciona un PDF, JPG o PNG de máximo 10 MB.");return;
   }
   lock.current=true;setBusy(true);setError("");
   let path="";
   try{
     const supabase=await getClient();
    const sha=await readHash(file);
     const extension=file.type==="application/pdf"?"pdf":file.type==="image/png"?"png":"jpg";
     path=user.id+"/"+crypto.randomUUID()+"."+extension;
     const upload=await supabase.storage.from("nexora-invoices").upload(path,file,
       {contentType:file.type,upsert:false});
     if(upload.error)throw new Error(upload.error.message);
     const insert=await supabase.from("nexora_invoice_drafts").insert({
       source_path:path,source_sha256:sha,original_filename:file.name.slice(0,180),
       created_by:user.id,supplier_name:fields.supplierName.slice(0,300),
       supplier_id:supplierId||null,invoice_no:fields.invoiceNo.trim()||null,
       invoice_date:fields.invoiceDate||null,currency:fields.currency,
       extracted_text:fields.rawText.slice(0,35000),
       lines:fields.lines,warnings:fields.warnings,status:"pending",
     }).select("*").single();
     if(insert.error)throw new Error(insert.error.code==="23505"?
       "Esta factura ya fue registrada. Abre el documento existente.":insert.error.message);
     openDraft(parseDraft(insert.data as DbRow));
     toast.success("Factura guardada para revisión, sin crear existencias.");
     await load();
   }catch(e){
     if(path){
       try{(await getClient()).storage.from("nexora-invoices").remove([path]);}
       catch{ /* El documento se mantiene privado; se permite limpieza administrativa. */ }
     }
     setError(e instanceof Error?e.message:"No se pudo guardar.");
   }finally{setBusy(false);lock.current=false;}
 };
 const saveChanges=async()=>{
   if(!active||!fields||!admin||active.status!=="pending")throw new Error("Factura no editable.");
   const supabase=await getClient();
   const result=await supabase.from("nexora_invoice_drafts").update({
     supplier_name:fields.supplierName.slice(0,300),
     supplier_id:supplierId||null,invoice_no:fields.invoiceNo.trim()||null,
     invoice_date:fields.invoiceDate||null,currency:fields.currency,
     extracted_text:fields.rawText.slice(0,35000),
     lines:fields.lines,warnings:fields.warnings,
   }).eq("id",active.id).select("*").single();
   if(result.error)throw new Error(result.error.message);
   const updated=parseDraft(result.data as DbRow);
   setActive(updated);
   return updated;
 };
 const finalize=async(action:"approve"|"prepare")=>{
   if(!active||!admin||lock.current)return;
   lock.current=true;setBusy(true);setError("");
   try{
     const supabase=await getClient();
     if(action==="approve")await saveChanges();
     const {data,error:rpcError}=await supabase.rpc("nexora_invoice_finalize",{
       p_id:active.id,p_action:action,
     });
     if(rpcError)throw new Error(rpcError.message);
     const result=data as {status?:string;receptionId?:string};
     toast.success(action==="approve"?"Factura revisada y costos aprobados.":"Recepción creada en borrador.");
     if(action==="prepare"){
       if(!result.receptionId)throw new Error("Falta el ID de recepción confirmada por el servidor.");
       navigate("/recepcion/nueva/"+result.receptionId);
       return;
     }
     await load();
     setActive(prev=>prev?{...prev,status:"reviewed"}:prev);
   }catch(e){setError(e instanceof Error?e.message:"La validación no se completó.");}
   finally{setBusy(false);lock.current=false;}
 };
 const original=async()=>{
   if(!active)return;
   const supabase=await getClient();
   const {data,error:e}=await supabase.storage.from("nexora-invoices")
     .createSignedUrl(active.source_path,120);
   if(e||!data?.signedUrl){setError(e?.message??"No se pudo abrir el documento.");return;}
   window.open(data.signedUrl,"_blank","noopener,noreferrer");
 };
 const editable=admin&&(!active||active.status==="pending");
 return <main className="space-y-4">
   <div className="flex flex-wrap items-center justify-between gap-2">
     <h1 className="text-2xl font-bold">Factura de proveedor</h1>
     <Button asChild variant="outline" size="sm"><Link to="/recepcion"><ArrowLeft className="size-4"/> Recepciones</Link></Button>
   </div>
   <section className="space-y-3 rounded-xl border bg-card p-4">
     <div className="flex flex-wrap items-center justify-between gap-2">
       <h2 className="font-semibold">Lectura de PDF o fotografía</h2>
       <Button size="sm" variant="outline" onClick={clear}>Nueva factura</Button>
     </div>
     <Input aria-label="Seleccionar factura" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
       disabled={busy} onChange={e=>{const chosen=e.target.files?.[0];if(chosen)void readFile(chosen);}}/>
     {message?<p role="status" className="text-sm text-muted-foreground">{message}</p>:null}
     {busy?<p role="status">Procesando documento...</p>:null}
     {active?<div className="flex flex-wrap items-center gap-2 text-sm">
       <span>Documento: {active.original_filename} · {active.status==="pending"?"Pendiente":active.status==="reviewed"?"Revisada":"Recepción preparada"}</span>
       <Button variant="outline" size="sm" onClick={()=>void original()}>Ver original</Button>
     </div>:null}
     {error?<p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>:null}
   </section>
   {fields?<section className="space-y-4 rounded-xl border bg-card p-4">
     <h2 className="font-semibold">Datos de la factura</h2>
     <div className="grid gap-3 md:grid-cols-2">
       <label className="space-y-1 text-sm"><span>Proveedor detectado</span>
         <Input value={fields.supplierName} disabled={!editable} onChange={e=>edit({supplierName:e.target.value})}/>
       </label>
       <label className="space-y-1 text-sm"><span>Proveedor del catálogo</span>
         <select className="h-10 w-full rounded-md border bg-background px-2" value={supplierId}
           disabled={!editable} onChange={e=>setSupplierId(e.target.value)}>
           <option value="">Seleccionar proveedor</option>
           {suppliers.filter(s=>s.isActive||s.id===supplierId).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
         </select>
       </label>
       <label className="space-y-1 text-sm"><span>Número de factura</span>
         <Input value={fields.invoiceNo} disabled={!editable} onChange={e=>edit({invoiceNo:e.target.value})}/>
       </label>
       <label className="space-y-1 text-sm"><span>Fecha</span>
         <Input type="date" value={fields.invoiceDate} disabled={!editable} onChange={e=>edit({invoiceDate:e.target.value})}/>
       </label>
       <label className="space-y-1 text-sm"><span>Moneda</span>
         <select className="h-10 w-full rounded-md border bg-background px-2" value={fields.currency}
           disabled={!editable} onChange={e=>edit({currency:e.target.value as InvoiceSuggestion["currency"]})}>
           {["COP","USD","EUR","OTRA"].map(c=><option key={c} value={c}>{c}</option>)}
         </select>
       </label>
     </div>
     {fields.warnings.length>0?<p className="text-sm text-amber-600">Revisar: {fields.warnings.join(" · ")}</p>:null}
     <div className="overflow-x-auto rounded-lg border">
       <table className="w-full min-w-[820px] text-sm">
         <thead className="bg-muted/30"><tr>
           <th className="p-2 text-left">Descripción de factura</th><th className="p-2 text-left">Referencia Nexora</th>
           <th className="p-2 text-right">Cantidad</th><th className="p-2 text-right">Costo unitario</th>
           <th className="p-2 text-left">Revisión</th><th className="p-2"></th>
         </tr></thead>
         <tbody>{fields.lines.map((line,i)=><tr className="border-t" key={i}>
           <td className="p-2">{editable?<Input aria-label={"Descripción "+(i+1)} value={line.description}
             onChange={e=>editLine(i,{description:e.target.value})}/>:line.description}</td>
           <td className="p-2">
             {editable?<select aria-label={"Referencia "+(i+1)} value={line.productId??""}
               className="w-full rounded-md border bg-background p-2" onChange={e=>editLine(i,{
                 productId:e.target.value||null,
                 sku:catalog.find(p=>p.id===e.target.value)?.sku??null,
               })}>
               <option value="">Sin coincidencia</option>
               {catalog.map(p=><option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}
             </select>:catalog.find(p=>p.id===line.productId)?.name??"Sin referencia"}
           </td>
           <td className="p-2 text-right">{editable?<Input aria-label={"Cantidad "+(i+1)} type="number" min="1" step="1" className="w-24 ml-auto"
             value={line.quantity} onChange={e=>editLine(i,{quantity:Number(e.target.value)})}/>:line.quantity}</td>
           <td className="p-2 text-right">{editable?<Input aria-label={"Costo "+(i+1)} type="number" min="0.01" step="0.01" className="w-36 ml-auto"
             value={line.unitCost??""} onChange={e=>editLine(i,{unitCost:e.target.value?Number(e.target.value):null})}/>:money(line.unitCost)}</td>
           <td className="p-2 text-xs text-amber-600">{line.warning??(!line.productId?"Sin referencia":line.unitCost===null?"Sin costo":"")}</td>
           <td className="p-2">{editable?<Button size="icon" variant="ghost" aria-label={"Eliminar línea "+(i+1)}
             onClick={()=>edit({lines:fields.lines.filter((_,n)=>n!==i)})}><Trash2 className="size-4"/></Button>:null}</td>
         </tr>)}</tbody>
       </table>
     </div>
     {editable?<Button size="sm" variant="outline" onClick={()=>edit({lines:[...fields.lines,{
       description:"",quantity:1,unitCost:null,total:null,productId:null,sku:null,
     }]})}><Plus className="size-4"/> Añadir línea</Button>:null}
     <div className="flex flex-wrap gap-2">
       {!active?<Button disabled={!file||busy} onClick={()=>void save()}><FileUp className="size-4"/> Guardar para revisión</Button>:null}
       {active&&admin&&active.status==="pending"?<Button disabled={busy} onClick={()=>void finalize("approve")}>
         <ShieldCheck className="size-4"/> Aprobar datos y costos
       </Button>:null}
       {active&&admin&&active.status==="reviewed"?<Button disabled={busy} onClick={()=>void finalize("prepare")}>
         Preparar recepción
       </Button>:null}
       {active?.reception_id?<Button asChild variant="outline"><Link to={"/recepcion/nueva/"+active.reception_id}>Abrir recepción</Link></Button>:null}
     </div>
   </section>:null}
   <section className="space-y-3 rounded-xl border bg-card p-4">
     <div className="flex items-center justify-between">
       <h2 className="font-semibold">Facturas registradas</h2>
       <Button variant="ghost" size="sm" disabled={loadingList} onClick={()=>void load()}><RefreshCw className="size-4"/>Actualizar</Button>
     </div>
     {drafts.length?<div className="divide-y rounded-lg border">{drafts.map(d=><button key={d.id}
       type="button" className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted/30"
       onClick={()=>openDraft(d)}>
       <span className="min-w-0 truncate">{d.invoice_no||d.original_filename} · {d.supplier_name||"Proveedor pendiente"}</span>
       <span className="shrink-0 text-xs text-muted-foreground">{d.status==="pending"?"Pendiente":d.status==="reviewed"?"Revisada":"Preparada"}</span>
     </button>)}</div>:<p className="text-sm text-muted-foreground">{loadingList?"Consultando...":"No hay facturas asistidas guardadas."}</p>}
   </section>
 </main>;
};
export default InvoiceCapture;
