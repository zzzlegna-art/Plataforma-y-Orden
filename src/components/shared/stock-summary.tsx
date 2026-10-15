import { useTranslation } from "react-i18next";

import type { ProductStock } from "@/lib/selectors";
import { cn } from "@/lib/utils";

const TONES = {
  success: "border-success/30 bg-success/10 text-success",
  info: "border-info/30 bg-info/10 text-info",
  warning: "border-warning/30 bg-warning/10 text-warning",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted/60 text-muted-foreground",
  primary: "border-primary/30 bg-primary/10 text-primary",
} as const;

/** Resumen del stock de un producto por estado de sus seriales. */
export const StockSummary = ({ stock }: { stock: ProductStock }) => {
  const { t } = useTranslation();
  const cells = [
    { key: "en_bodega", value: stock.enBodega, tone: "success" as const },
    { key: "en_local", value: stock.enLocal, tone: "success" as const },
    { key: "vendido", value: stock.vendido, tone: "neutral" as const },
    { key: "en_reparacion", value: stock.enReparacion, tone: "warning" as const },
    { key: "defectuoso", value: stock.defectuoso, tone: "destructive" as const },
    { key: "entregado_garantia", value: stock.entregadoGarantia, tone: "primary" as const },
    { key: "liberado", value: stock.liberado, tone: "neutral" as const },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.key} className={cn("rounded-lg border p-3", TONES[cell.tone])}>
            <p className="text-xs font-medium">{t(`unitStatus.${cell.key}`)}</p>
            <p className="font-tabular mt-1 text-xl font-semibold">{cell.value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t("unit.conditionSummary", { nuevo: stock.nuevo, seminuevo: stock.seminuevo })}
      </p>
    </div>
  );
};
