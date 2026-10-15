import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Diálogo previo a imprimir: permite escribir una nota corta y puntual ("Devolución Camilo")
 * que sale impresa en la etiqueta. No se guarda en ningún lado, solo vive en esa impresión.
 * Se usa tanto para imprimir un serial (ficha) como para una selección de varios.
 */
export const PrintLabelsDialog = ({
  open,
  onOpenChange,
  count,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cuántas etiquetas se van a imprimir; si hay más de una, la nota aplica a todas por igual. */
  count: number;
  onConfirm: (nota: string) => void;
}) => {
  const { t } = useTranslation();
  const [nota, setNota] = useState("");

  const cerrar = (siguiente: boolean) => {
    onOpenChange(siguiente);
    if (!siguiente) setNota("");
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {count > 1 ? t("printLabelsDialog.titleCount", { count }) : t("printLabelsDialog.title")}
          </DialogTitle>
          <DialogDescription>{t("printLabelsDialog.hint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="printLabelsNota">{t("printLabelsDialog.notaLabel")}</Label>
          <Input
            id="printLabelsNota"
            value={nota}
            placeholder={t("printLabelsDialog.notaPlaceholder")}
            onChange={(event) => setNota(event.target.value)}
            maxLength={40}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => cerrar(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onConfirm(nota);
              cerrar(false);
            }}
          >
            {t("serialHistory.printLabel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
