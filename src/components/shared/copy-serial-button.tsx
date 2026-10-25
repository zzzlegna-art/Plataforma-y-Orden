import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** Copia un único IMEI/serial, sin modificar filtros ni seleccionar otras unidades. */
export const CopySerialButton = ({ serial }: { serial: string }) => {
  const { t } = useTranslation();

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(serial);
      toast.success(t("unit.serialCopied"));
    } catch {
      toast.error(t("unit.copySerialsError"));
    }
  };

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary"
      title={t("unit.copySerial", { serial })}
      aria-label={t("unit.copySerial", { serial })}
      onClick={(event) => {
        event.stopPropagation();
        void copiar();
      }}
    >
      <Copy className="h-3.5 w-3.5" />
    </Button>
  );
};
