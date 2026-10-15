import { toast } from "sonner";

import { DomainError } from "@/lib/db";
import { subirDocumentoGarantia } from "@/lib/warranty-documents";

/**
 * Sube el archivo elegido (si hay uno) y lo enlaza a las garantías dadas. No hace nada si no
 * se eligió ningún archivo; avisa por toast si la subida falla (las garantías ya quedaron
 * registradas de todas formas, esto no las afecta).
 */
export const subirSiHayArchivo = async (
  archivo: File | null,
  warrantyIds: string[],
  t: (key: string, params?: Record<string, unknown>) => string,
) => {
  if (!archivo || warrantyIds.length === 0) return;
  try {
    await subirDocumentoGarantia(archivo, warrantyIds);
    toast.success(t("warrantyDocs.uploaded"));
  } catch (error) {
    toast.error(error instanceof DomainError ? t(error.key, error.params) : t("errors.unexpected"));
  }
};

