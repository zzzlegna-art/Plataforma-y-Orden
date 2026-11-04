/** OCR gratuito en el navegador. El documento no se envía a un proveedor de IA.
 *  Las bibliotecas se descargan al solicitar la lectura y están fijadas por versión.
 *  Si la red impide cargarlas se permite capturar la factura manualmente. */
type OcrWorker={
  recognize:(source:HTMLCanvasElement|Blob)=>Promise<{data:{text:string}}>;
  terminate:()=>Promise<void>;
};
type OcrModule={createWorker:(lang:string)=>Promise<OcrWorker>};
type PDFPage={
  getTextContent:()=>Promise<{items:unknown[]}>;
  getViewport:(v:{scale:number})=>{width:number;height:number};
  render:(arg:{canvasContext:CanvasRenderingContext2D;viewport:{width:number;height:number};canvas:HTMLCanvasElement})=>{promise:Promise<void>};
};
type PdfInstance={numPages:number;getPage:(page:number)=>Promise<PDFPage>};
type PdfModule={
 GlobalWorkerOptions:{workerSrc:string};
 getDocument:(arg:{data:Uint8Array})=>{promise:Promise<PdfInstance>};
};
const pdfUrl="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs";
const pdfWorkerUrl="https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs";
const tesseractUrl="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js";
let pdfPromise:Promise<PdfModule>|null=null;
let ocrPromise:Promise<OcrModule>|null=null;
const pdfModule=()=>pdfPromise??=import(/* @vite-ignore */ pdfUrl) as Promise<PdfModule>;
const ocrModule=()=>ocrPromise??=import(/* @vite-ignore */ tesseractUrl) as Promise<OcrModule>;
const ocr=async(source:HTMLCanvasElement|Blob):Promise<string>=>{
  const mod=await ocrModule();
  const worker=await mod.createWorker("spa+eng");
  try{return (await worker.recognize(source)).data.text??"";}
  finally{await worker.terminate();}
};
const extractPageText=(items:unknown[]):string=>{
  let text="",prevY:number|null=null;
  for(const it of items){
    if(!it||typeof it!=="object")continue;
    const obj=it as {str?:unknown;transform?:unknown;hasEOL?:unknown};
    if(typeof obj.str!=="string")continue;
    const y=Array.isArray(obj.transform)&&typeof obj.transform[5]==="number"?obj.transform[5]:null;
    if(y!==null&&prevY!==null&&Math.abs(y-prevY)>4)text+="\n";
    text+=obj.str+(obj.hasEOL?"\n":" ");
    if(y!==null)prevY=y;
  }
  return text;
};
export const readInvoiceDocument=async(file:File,onProgress?:(msg:string)=>void):Promise<string>=>{
  if(file.size>10485760||file.size===0)throw new Error("Adjunta un PDF/JPG/PNG de máximo 10 MB.");
  const supported=["application/pdf","image/jpeg","image/png"];
  if(!supported.includes(file.type))throw new Error("Solo se permiten PDF, JPG o PNG.");
  if(file.type!=="application/pdf"){
    onProgress?.("Reconociendo texto de la fotografía...");
    return await ocr(file);
  }
  onProgress?.("Leyendo el PDF...");
  const pdfjs=await pdfModule();
  pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  const maxPages=Math.min(pdf.numPages,12);
  const chunks:string[]=[];
  for(let index=1;index<=maxPages;index++){
    const page=await pdf.getPage(index);
    const text=extractPageText((await page.getTextContent()).items);
    if(text.trim().length>=35){chunks.push(text);continue;}
    onProgress?.("Aplicando OCR a la página "+index+"...");
    const view=page.getViewport({scale:1.6});
    const canvas=document.createElement("canvas");
    canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
    const context=canvas.getContext("2d");
    if(!context)throw new Error("Este navegador no permite leer imágenes de PDF.");
    await page.render({canvasContext:context,viewport:view,canvas}).promise;
    chunks.push(await ocr(canvas));
    canvas.width=0;canvas.height=0;
  }
  if(pdf.numPages>maxPages)
    chunks.push("\n[Documento largo: revisar manualmente páginas adicionales]");
  return chunks.join("\n");
};
