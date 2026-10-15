import { supabase } from "@/integrations/supabase/client";
import { DomainError } from "./db";

/**
 * Límites del plan gratuito de Supabase (revisar si el proyecto cambia de plan: en un plan
 * pago estos números ya no aplican y este archivo quedaría avisando de un límite que no es).
 */
export const LIMITE_ARCHIVOS_BYTES = 1 * 1024 ** 3; // 1 GB
export const LIMITE_BASE_DATOS_BYTES = 500 * 1024 ** 2; // 500 MB

export interface UsoAlmacenamiento {
  documentosBytes: number;
  documentosCount: number;
  baseDatosBytes: number;
}

export const obtenerUsoAlmacenamiento = async (): Promise<UsoAlmacenamiento> => {
  const { data, error } = await supabase.rpc("bodega_uso_almacenamiento");
  if (error || !data) {
    console.error(`No se pudo obtener el uso de almacenamiento: ${error?.message}`);
    throw new DomainError("errors.unexpected");
  }
  const fila = data as Record<string, unknown>;
  return {
    documentosBytes: Number(fila.documentos_bytes ?? 0),
    documentosCount: Number(fila.documentos_count ?? 0),
    baseDatosBytes: Number(fila.base_datos_bytes ?? 0),
  };
};

/** Qué tan cerca del límite está un uso (0 a 1): para decidir el color del aviso. */
export type NivelUso = "ok" | "aviso" | "critico";
export const nivelDeUso = (bytes: number, limite: number): NivelUso => {
  const proporcion = limite > 0 ? bytes / limite : 0;
  if (proporcion >= 0.9) return "critico";
  if (proporcion >= 0.7) return "aviso";
  return "ok";
};

/** Bytes a un texto legible (KB/MB/GB), sin depender del idioma del navegador. */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};
