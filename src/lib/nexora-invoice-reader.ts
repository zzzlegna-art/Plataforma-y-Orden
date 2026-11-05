/** OCR gratuito en el navegador. El documento no se envía a un proveedor de IA.
 *  Las bibliotecas se descargan al solicitar la lectura y están fijadas por versión.
 *  Si la red impide cargarlas se permite capturar la factura manualmente. */
type OcrWorker={
  recognize:(source:HTMLCanvasElement|Blob)=>Promise<{data:{text:string}}>;
  terminate:()=>Promise<void>;
};
type OcrCreateWorker=(lang:string)=>Promise<OcrWorker>;
/**
 * El bundle ESM de Tesseract.js publicado por CDN puede exportar
 * la fábrica como "default.createWorker", no como export nombrado.
 * El cast de TypeScript no cambia la forma real del módulo importado.
 */
export const resolveOcrCreateWorker=(module:unknown):OcrCreateWorker=>{
  if(!module||typeof module!=="object")
    throw new Error("No se pudo cargar el lector de facturas. Completa los datos manualmente.");
  const exports=module as Record<string,unknown>;
  for(const candidate of [exports,exports.default]){
    if(candidate&&typeof candidate==="object"){
      const library=candidate as {createWorker?:unknown};
      if(typeof library.createWorker==="function")
        return (lang:string)=>(library.createWorker as OcrCreateWorker)(lang);
    }
  }
  throw new Error("El lector de imágenes no se inicializó. Completa los datos manualmente.");
};
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
let ocrPromise:Promise<unknown>|null=null;
const pdfModule=()=>pdfPromise??=import(/* @vite-ignore */ pdfUrl) as Promise<PdfModule>;
const ocrModule=()=>ocrPromise??=import(/* @vite-ignore */ tesseractUrl);
const ocr=async(source:HTMLCanvasElement|Blob):Promise<string>=>{
  const createWorker=resolveOcrCreateWorker(await ocrModule());
  const worker=await createWorker("spa+eng");
  try{return (await worker.recognize(source)).data.text??"";}
  finally{await worker.terminate();}
};
/**
 * PDF.js puede devolver bloques de texto fuera de orden (por columnas).
 * Reagrupar por coordenada vertical y luego horizontal mantiene cada fila
 * de artículo alineada con cantidad, costo unitario y subtotal.
 */
export const extractPageText = (items: unknown[]): string => {
  type Item = { text: string; x: number; y: number; eol: boolean; positioned: boolean };
  const tokens: Item[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const obj = it as { str?: unknown; transform?: unknown; hasEOL?: unknown };
    if (typeof obj.str !== "string") continue;
    const transform = Array.isArray(obj.transform) ? obj.transform : null;
    const positioned = Boolean(transform && typeof transform[4] === "number"
      && typeof transform[5] === "number");
    tokens.push({
      text: obj.str.trim(), x: positioned ? Number(transform![4]) : 0,
      y: positioned ? Number(transform![5]) : 0, eol: Boolean(obj.hasEOL), positioned,
    });
  }
  if (!tokens.length) return "";

  // Para PDFs sin geometría aprovechable se conserva el orden original.
  if (tokens.filter(token => token.positioned).length < tokens.length * .8) {
    let result = "";
    for (const token of tokens) result += token.text + (token.eol ? "\n" : " ");
    return result;
  }

  const lines: { y: number; items: Item[] }[] = [];
  for (const item of tokens) {
    if (!item.text) continue;
    let line = lines.find(candidate => Math.abs(candidate.y - item.y) <= 2.5);
    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map(line => line.items.sort((a, b) => a.x - b.x)
    .map(item => item.text).join(" ")).join("\n");
};

/** Un PDF escaneado puede contener texto corto solo en el encabezado.
 * No asumir que toda la tabla es legible por encontrar ese encabezado. */
export const shouldOcrInvoicePage = (text: string): boolean => {
  const visible = text.replace(/\s+/g, " ").trim();
  const digits = (visible.match(/\d/g) ?? []).length;
  return visible.length < 60 || (visible.length < 160 && digits < 4);
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
    if(!shouldOcrInvoicePage(text)){chunks.push(text);continue;}
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
