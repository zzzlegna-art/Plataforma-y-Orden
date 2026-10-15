import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DomainError } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { abrirEnlaceExterno } from "./abrir-enlace-externo";
import {
  listarDocumentosDeGarantia,
  subirDocumentoGarantia,
  urlDescargaDocumento,
  TIPOS_DOCUMENTO_ACEPTADOS,
  type DocumentoGarantia,
} from "@/lib/warranty-documents";

/**
 * Campo para elegir el PDF/foto de la hoja de "relación" del proveedor, antes de registrar la
 * garantía (o el lote). El archivo se guarda en pantalla; se sube después de crear la o las
 * garantías, ya con su(s) id(s) para enlazarlo.
 */
export const SelectorDocumentoGarantia = ({
  archivo,
  onChange,
}: {
  archivo: File | null;
  onChange: (archivo: File | null) => void;
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  if (archivo) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{archivo.name}</span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => onChange(null)}
          aria-label={t("warrantyDocs.remove")}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={TIPOS_DOCUMENTO_ACEPTADOS}
        className="hidden"
        data-testid="input-documento-garantia"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Paperclip />
        {t("warrantyDocs.attach")}
      </Button>
    </>
  );
};

const tamanoLegible = (bytes?: number) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Documentos enlazados a una garantía. Además de verlos y descargarlos, aquí también se
 * pueden agregar más adelante (no solo al recibirla): por ejemplo si llega un papel nuevo
 * después, o si la garantía se registró sin adjuntar nada.
 */
export const DocumentosGarantiaSection = ({ warrantyId }: { warrantyId: string }) => {
  const { t } = useTranslation();
  const [estado, setEstado] = useState<"inicial" | "cargando" | "listo" | "error">("inicial");
  const [documentos, setDocumentos] = useState<DocumentoGarantia[]>([]);
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [archivoNuevo, setArchivoNuevo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  const cargar = async () => {
    setEstado("cargando");
    try {
      setDocumentos(await listarDocumentosDeGarantia(warrantyId));
      setEstado("listo");
    } catch {
      setEstado("error");
    }
  };

  const abrir = async (documento: DocumentoGarantia) => {
    setAbriendo(documento.id);
    try {
      const url = await urlDescargaDocumento(documento.storagePath);
      abrirEnlaceExterno(url);
    } catch (error) {
      toast.error(error instanceof DomainError ? t(error.key) : t("errors.unexpected"));
    } finally {
      setAbriendo(null);
    }
  };

  const subir = async () => {
    if (!archivoNuevo) return;
    setSubiendo(true);
    try {
      await subirDocumentoGarantia(archivoNuevo, [warrantyId]);
      toast.success(t("warrantyDocs.uploaded"));
      setArchivoNuevo(null);
      await cargar();
    } catch (error) {
      toast.error(error instanceof DomainError ? t(error.key, error.params) : t("errors.unexpected"));
    } finally {
      setSubiendo(false);
    }
  };

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warrantyId]);

  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{t("warrantyDocs.title")}</h3>
      {estado === "cargando" || estado === "inicial" ? (
        <div role="status" className="space-y-2">
          <span className="sr-only">{t("common.loading")}</span>
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : estado === "error" ? (
        <p className="text-sm text-destructive">{t("errors.unexpected")}</p>
      ) : (
        <>
          {documentos.length === 0 ? (
            <p className="mb-3 text-sm text-muted-foreground">{t("warrantyDocs.empty")}</p>
          ) : (
            <ul className="mb-3 divide-y">
              {documentos.map((documento) => (
                <li key={documento.id} className="flex items-center gap-3 py-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{documento.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(documento.createdAt)}
                      {documento.sizeBytes ? ` · ${tamanoLegible(documento.sizeBytes)}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    loading={abriendo === documento.id}
                    onClick={() => void abrir(documento)}
                  >
                    {t("warrantyDocs.open")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <SelectorDocumentoGarantia archivo={archivoNuevo} onChange={setArchivoNuevo} />
            {archivoNuevo ? (
              <Button type="button" size="sm" loading={subiendo} onClick={() => void subir()}>
                {t("warrantyDocs.upload")}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
};
