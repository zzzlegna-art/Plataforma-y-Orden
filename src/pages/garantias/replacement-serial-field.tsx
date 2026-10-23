import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { SerialScanInput } from "@/components/shared/serial-scan-input";
import { Button } from "@/components/ui/button";
import { useStore } from "@/hooks/use-store";
import { isSameText } from "@/lib/actions/guards";
import { getReplacementUnits } from "@/lib/selectors";
import type { Warranty } from "@/lib/types";

/**
 * Captura del serial de la unidad de reemplazo en un cambio de equipo: se escribe, se escanea
 * con lector o con la cámara, y solo se acepta un serial que realmente pueda entregarse
 * (en bodega o local, sin venta y de la misma referencia, incluso en garantías previas).
 */
export const ReplacementSerialField = ({
  warranty,
  value,
  onChange,
}: {
  warranty: Pick<Warranty, "productId" | "referenciaManual">;
  /** Id de la unidad elegida ("" si aún no hay). */
  value: string;
  onChange: (unitId: string) => void;
}) => {
  const { t } = useTranslation();
  const { db } = useStore();

  const selected = value ? db.units.find((unit) => unit.id === value) : undefined;
  const selectedProduct = selected
    ? db.products.find((product) => product.id === selected.productId)?.name
    : undefined;
  const productoEsperado = warranty.productId ?? db.products.find(
    (product) => warranty.referenciaManual && isSameText(product.name, warranty.referenciaManual),
  )?.id;
  const requiereReferencia = Boolean(warranty.productId || warranty.referenciaManual?.trim());

  // Un serial liberado puede reutilizarse en otra unidad: puede haber varias con el mismo texto.
  const coincidencias = (serial: string) => db.units.filter((unit) => isSameText(unit.serial, serial));
  const disponible = (serial: string) => {
    if (requiereReferencia && !productoEsperado) return undefined;
    const ids = new Set(getReplacementUnits(db, productoEsperado).map((unit) => unit.id));
    return coincidencias(serial).find((unit) => ids.has(unit.id));
  };

  const validate = (serial: string): string | null => {
    if (requiereReferencia && !productoEsperado) return t("errors.unitProductMismatch");
    if (disponible(serial)) return null;
    const existentes = coincidencias(serial);
    if (existentes.length === 0) return t("warranty.replacementSerialUnknown", { serial });
    if (productoEsperado && existentes.every((unit) => unit.productId !== productoEsperado)) {
      return t("errors.unitProductMismatch");
    }
    return t("warranty.replacementSerialUnavailable", { serial });
  };

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <div className="min-w-0 text-sm">
          <p className="font-tabular font-medium">{selected.serial}</p>
          {selectedProduct ? (
            <p className="truncate text-xs text-muted-foreground">{selectedProduct}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("warranty.replacementChange")}
          title={t("warranty.replacementChange")}
          onClick={() => onChange("")}
        >
          <X />
        </Button>
      </div>
    );
  }

  return (
    <SerialScanInput
      autoFocus={false}
      hidePhoto
      autoConfirm
      validate={validate}
      onScan={(serial) => {
        const unit = disponible(serial);
        if (unit) onChange(unit.id);
      }}
      placeholder={t("warranty.replacementSerialPlaceholder")}
      hint={t("warranty.replacementSerialHint")}
    />
  );
};
