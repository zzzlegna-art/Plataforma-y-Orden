/**
 * Documentos de garantías: el PDF (o foto) de la hoja de "relación" que manda el proveedor al
 * enviar un lote de equipos. Un mismo archivo puede quedar enlazado a varias garantías (las
 * del mismo lote), por eso el documento se sube UNA vez y se enlaza a cada garantía aparte.
 *
 * Aparte del resto del backend (backend.ts), que sincroniza filas de la base en JSON: aquí se
 * sube un archivo binario al almacenamiento de Supabase, así que se usa el cliente de
 * Supabase directamente en vez del `nube`/`pushDb` genérico.
 */

import { supabase } from "@/integrations/supabase/client";
import { DomainError } from "./db";

const BUCKET = "warranty-documents";
/** Tipos que acepta el botón de subir (coincide con lo permitido en el bucket). */
export const TIPOS_DOCUMENTO_ACEPTADOS = "application/pdf,image/jpeg,image/png,image/heic,image/webp";
const TAMANO_MAXIMO_MB = 50;

export interface DocumentoGarantia {
  id: string;
  fileName: string;
  contentType?: string;
  sizeBytes?: number;
  createdAt: string;
  storagePath: string;
}

const rutaNueva = (archivo: File): string => {
  const año = new Date().getFullYear();
  const limpio = archivo.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `${año}/${crypto.randomUUID()}-${limpio}`;
};

/**
 * Sube un archivo y lo enlaza a una o varias garantías (un lote comparte el mismo archivo,
 * sin subirlo varias veces). No hace nada si no hay ninguna garantía a la que enlazarlo.
 */
export const subirDocumentoGarantia = async (archivo: File, warrantyIds: string[]): Promise<void> => {
  if (warrantyIds.length === 0) return;
  if (archivo.size > TAMANO_MAXIMO_MB * 1024 * 1024) {
    throw new DomainError("warrantyDocs.tooLarge", { max: TAMANO_MAXIMO_MB });
  }

  const path = rutaNueva(archivo);
  const { error: errorSubida } = await supabase.storage.from(BUCKET).upload(path, archivo, {
    contentType: archivo.type || undefined,
    upsert: false,
  });
  if (errorSubida) {
    console.error(`No se pudo subir el documento: ${errorSubida.message}`);
    throw new DomainError("warrantyDocs.uploadFailed");
  }

  const { data: documento, error: errorDocumento } = await supabase
    .from("bodega_documents")
    .insert({
      storage_path: path,
      file_name: archivo.name,
      content_type: archivo.type || null,
      size_bytes: archivo.size,
    })
    .select("id")
    .single();
  if (errorDocumento || !documento) {
    console.error(`No se pudo registrar el documento: ${errorDocumento?.message}`);
    // El archivo ya se subió: se deja (no es basura peligrosa) y se avisa del fallo al registrar.
    throw new DomainError("warrantyDocs.uploadFailed");
  }

  const { error: errorEnlaces } = await supabase
    .from("bodega_warranty_documents")
    .insert(warrantyIds.map((warrantyId) => ({ warranty_id: warrantyId, document_id: documento.id })));
  if (errorEnlaces) {
    console.error(`No se pudo enlazar el documento a la garantía: ${errorEnlaces.message}`);
    throw new DomainError("warrantyDocs.uploadFailed");
  }
};

/** Documentos enlazados a una garantía, del más nuevo al más viejo. */
export const listarDocumentosDeGarantia = async (warrantyId: string): Promise<DocumentoGarantia[]> => {
  const { data, error } = await supabase
    .from("bodega_warranty_documents")
    .select("bodega_documents(id, file_name, content_type, size_bytes, created_at, storage_path)")
    .eq("warranty_id", warrantyId);
  if (error) {
    console.error(`No se pudieron leer los documentos de la garantía: ${error.message}`);
    throw new DomainError("errors.unexpected");
  }
  type Fila = { bodega_documents: Record<string, unknown> | Record<string, unknown>[] | null };
  const documentos = ((data ?? []) as Fila[])
    .map((fila) => (Array.isArray(fila.bodega_documents) ? fila.bodega_documents[0] : fila.bodega_documents))
    .filter((doc): doc is Record<string, unknown> => Boolean(doc))
    .map(
      (doc): DocumentoGarantia => ({
        id: String(doc.id),
        fileName: String(doc.file_name),
        contentType: doc.content_type ? String(doc.content_type) : undefined,
        sizeBytes: typeof doc.size_bytes === "number" ? doc.size_bytes : undefined,
        createdAt: String(doc.created_at),
        storagePath: String(doc.storage_path),
      }),
    );
  return documentos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

/** Enlace temporal para ver o descargar un documento (el bucket es privado). */
export const urlDescargaDocumento = async (storagePath: string): Promise<string> => {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10);
  if (error || !data) {
    console.error(`No se pudo generar el enlace del documento: ${error?.message}`);
    throw new DomainError("warrantyDocs.downloadFailed");
  }
  return data.signedUrl;
};
