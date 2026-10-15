import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PendingImeiBadge } from "@/components/shared/status-badge";
import type { Product, ReceptionItem, UnitCondition } from "@/lib/types";
import { esCodigoInterno } from "@/lib/imei";
import { cn } from "@/lib/utils";

/** Fila editable de una recepción: serial/IMEI y condición. */
export const ReceptionItemRow = ({
  item,
  product,
  index,
  onSerialChange,
  onConditionChange,
  onRemove,
}: {
  item: ReceptionItem;
  product?: Product;
  index: number;
  onSerialChange: (serial: string) => void;
  onConditionChange: (condition: UnitCondition) => void;
  onRemove: () => void;
}) => {
  const { t } = useTranslation();
  const [serial, setSerial] = useState(item.serial);
  const esRepuesto = product?.categoria === "repuesto";

  useEffect(() => setSerial(item.serial), [item.serial]);

  const commit = () => {
    const next = serial.trim();
    if (!next || next === item.serial) {
      setSerial(item.serial);
      return;
    }
    onSerialChange(next);
  };

  return (
    <div
      className={cn(
        // Mismas columnas en todas las filas (también en repuestos) para que se alineen con el
        // encabezado de la lista.
        "animate-fade-in space-y-2 p-3 motion-reduce:animate-none even:bg-muted/25",
        "sm:grid sm:grid-cols-[2.5rem_minmax(0,1fr)_11.5rem_2.5rem] sm:items-center sm:gap-3 sm:space-y-0",
      )}
    >
      <span className="font-tabular text-xs font-medium text-muted-foreground">{index + 1}</span>
      <div className="min-w-0">
        {esRepuesto ? (
          <p className="font-tabular flex h-9 items-center text-sm">
            {serial}
            <span className="ml-2 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {t("receptions.autoSerial")}
            </span>
          </p>
        ) : (
          <div className="flex h-9 items-center gap-2">
            <Input
              value={serial}
              onChange={(event) => setSerial(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                }
              }}
              className="font-tabular h-9"
              aria-label={t("receptions.serial")}
            />
            {esCodigoInterno(item.serial) ? <PendingImeiBadge /> : null}
          </div>
        )}
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {product ? `${product.sku} · ${product.name}` : "—"}
        </p>
      </div>
      {esRepuesto ? (
        <span aria-hidden="true" className="hidden sm:block" />
      ) : (
        <ToggleGroup
          type="single"
          value={item.condition}
          onValueChange={(value) => value && onConditionChange(value as UnitCondition)}
          size="sm"
          className="justify-start"
        >
          <ToggleGroupItem value="nuevo" aria-label={t("condition.nuevo")}>
            {t("condition.nuevo")}
          </ToggleGroupItem>
          <ToggleGroupItem value="seminuevo" aria-label={t("condition.seminuevo")}>
            {t("condition.seminuevo")}
          </ToggleGroupItem>
        </ToggleGroup>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-destructive"
        aria-label={t("common.delete")}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </div>
  );
};
