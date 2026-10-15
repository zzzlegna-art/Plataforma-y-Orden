import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";

import { PendingImeiBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { esCodigoInterno } from "@/lib/imei";
import type { Product, ReceptionItem, UnitCondition } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Una unidad capturada en la recepción, como etiqueta compacta (serial + X para quitarla).
 * Al tocar el serial se abre un editor del ancho de la fila para corregir el serial/IMEI o
 * cambiar la condición; así se conserva todo lo que se podía hacer antes en cada fila.
 */
export const ReceptionItemChip = ({
  item,
  product,
  readOnly = false,
  onSerialChange,
  onConditionChange,
  onRemove,
}: {
  item: ReceptionItem;
  product?: Product;
  /** Recepción ya confirmada: solo se ve. */
  readOnly?: boolean;
  onSerialChange: (serial: string) => void;
  onConditionChange: (condition: UnitCondition) => void;
  onRemove: () => void;
}) => {
  const { t } = useTranslation();
  const esRepuesto = product?.categoria === "repuesto";
  const pendiente = !esRepuesto && esCodigoInterno(item.serial);
  const [editando, setEditando] = useState(false);
  const [serial, setSerial] = useState(item.serial);

  useEffect(() => setSerial(item.serial), [item.serial]);

  const guardar = () => {
    const siguiente = serial.trim();
    if (siguiente && siguiente !== item.serial) onSerialChange(siguiente);
    else setSerial(item.serial);
    setEditando(false);
  };

  if (editando && !readOnly && !esRepuesto) {
    return (
      <li
        data-item-id={item.id}
        className="col-span-full flex flex-wrap items-center gap-2 rounded-md border border-primary/50 bg-primary/5 p-2"
      >
        <Input
          autoFocus
          value={serial}
          onChange={(event) => setSerial(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              guardar();
            }
            if (event.key === "Escape") {
              setSerial(item.serial);
              setEditando(false);
            }
          }}
          className="font-tabular h-9 min-w-[12rem] flex-1"
          aria-label={t("receptions.serial")}
        />
        <ToggleGroup
          type="single"
          value={item.condition}
          onValueChange={(value) => value && onConditionChange(value as UnitCondition)}
          size="sm"
        >
          <ToggleGroupItem value="nuevo" aria-label={t("condition.nuevo")}>
            {t("condition.nuevo")}
          </ToggleGroupItem>
          <ToggleGroupItem value="seminuevo" aria-label={t("condition.seminuevo")}>
            {t("condition.seminuevo")}
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          type="button"
          size="icon"
          className="h-9 w-9"
          aria-label={t("common.save")}
          onClick={guardar}
        >
          <Check />
        </Button>
      </li>
    );
  }

  return (
    <li
      data-item-id={item.id}
      className={cn(
        "flex animate-fade-in items-center justify-between gap-1 rounded-md border bg-background/40 py-1 pl-2.5 pr-1 motion-reduce:animate-none",
        pendiente && "border-warning/50 bg-warning/5",
      )}
    >
      {readOnly || esRepuesto ? (
        <span className="font-tabular min-w-0 flex-1 truncate text-[13px]">{item.serial}</span>
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 space-y-0.5 py-0.5 text-left"
          aria-label={`${t("common.edit")} ${item.serial}`}
          onClick={() => setEditando(true)}
        >
          <span className="font-tabular block truncate text-[13px]">{item.serial}</span>
          {pendiente ? <PendingImeiBadge /> : null}
        </button>
      )}
      {readOnly ? null : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-destructive"
          aria-label={t("common.delete")}
          onClick={onRemove}
        >
          <X />
        </Button>
      )}
    </li>
  );
};
