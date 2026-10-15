import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Cloud, CloudUpload, Database, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useStore } from "@/hooks/use-store";
import { useRunAction } from "@/hooks/use-run-action";
import { updateSettings } from "@/lib/actions/users";
import { APP_CURRENCY, formatNumber } from "@/lib/format";
import { onEnter } from "@/lib/keys";
import {
  LIMITE_ARCHIVOS_BYTES,
  LIMITE_BASE_DATOS_BYTES,
  formatBytes,
  nivelDeUso,
  obtenerUsoAlmacenamiento,
  type UsoAlmacenamiento,
} from "@/lib/storage-usage";
import { cn } from "@/lib/utils";

/** Datos de la empresa y resumen del inventario guardado en el backend. */
export const DataTab = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const [companyName, setCompanyName] = useState(db.settings.companyName);
  const [currency, setCurrency] = useState(db.settings.currency || APP_CURRENCY);
  const [uso, setUso] = useState<UsoAlmacenamiento | null>(null);
  const [usoEstado, setUsoEstado] = useState<"cargando" | "listo" | "error">("cargando");

  useEffect(() => {
    setCompanyName(db.settings.companyName);
    setCurrency(db.settings.currency || APP_CURRENCY);
  }, [db.settings.companyName, db.settings.currency]);

  useEffect(() => {
    obtenerUsoAlmacenamiento()
      .then((datos) => {
        setUso(datos);
        setUsoEstado("listo");
      })
      .catch(() => setUsoEstado("error"));
  }, []);

  const guardar = async () => {
    await runAction((db2, actor) => updateSettings(db2, actor, { companyName, currency }), {
      success: "settings.saved",
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-4 rounded-lg border bg-card p-4" onKeyDown={onEnter(guardar)}>
        <div>
          <h3 className="text-sm font-semibold">{t("settings.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("settings.description")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="companyName">{t("settings.companyName")}</Label>
          <Input
            id="companyName"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">{t("settings.currency")}</Label>
          <Input
            id="currency"
            value={currency}
            maxLength={3}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          />
          <p className="text-xs text-muted-foreground">{t("settings.currencyHint")}</p>
        </div>
        <Button type="button" loading={runAction.pending} onClick={() => void guardar()}>
          <Save />
          {t("common.save")}
        </Button>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Cloud className="h-4 w-4 text-primary" />
            {t("settings.storageTitle")}
          </h3>
          <p className="text-xs text-muted-foreground">{t("settings.storageDescription")}</p>
        </div>

        <ul className="grid grid-cols-2 gap-2 text-sm">
          <li className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">{t("nav.inventory")}</p>
            <p className="font-tabular mt-1 text-lg font-semibold">
              {formatNumber(db.products.length)}
            </p>
          </li>
          <li className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">{t("nav.units")}</p>
            <p className="font-tabular mt-1 text-lg font-semibold">
              {formatNumber(db.units.length)}
            </p>
          </li>
          <li className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">{t("nav.orders")}</p>
            <p className="font-tabular mt-1 text-lg font-semibold">
              {formatNumber(db.orders.length)}
            </p>
          </li>
          <li className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">{t("nav.warranties")}</p>
            <p className="font-tabular mt-1 text-lg font-semibold">
              {formatNumber(db.warranties.length)}
            </p>
          </li>
        </ul>

        <div className="flex gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-xs text-primary">
          <CloudUpload className="h-4 w-4 shrink-0" />
          <p>{t("settings.cloudNote")}</p>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border bg-card p-4 lg:col-span-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Database className="h-4 w-4 text-primary" />
            {t("settings.usageTitle")}
          </h3>
          <p className="text-xs text-muted-foreground">{t("settings.usageDescription")}</p>
        </div>

        {usoEstado === "cargando" ? (
          <div role="status" className="grid gap-4 sm:grid-cols-2">
            <span className="sr-only">{t("common.loading")}</span>
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : usoEstado === "error" ? (
          <p className="text-sm text-destructive">{t("errors.unexpected")}</p>
        ) : uso ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <BarraDeUso
              titulo={t("settings.usageFiles")}
              subtitulo={t("settings.usageFilesCount", { count: uso.documentosCount })}
              bytes={uso.documentosBytes}
              limite={LIMITE_ARCHIVOS_BYTES}
            />
            <BarraDeUso titulo={t("settings.usageDatabase")} bytes={uso.baseDatosBytes} limite={LIMITE_BASE_DATOS_BYTES} />
          </div>
        ) : null}
      </section>
    </div>
  );
};

/** Una barra de progreso con el texto "X de Y (Z%)" y el color según qué tan cerca del límite. */
const BarraDeUso = ({
  titulo,
  subtitulo,
  bytes,
  limite,
}: {
  titulo: string;
  subtitulo?: string;
  bytes: number;
  limite: number;
}) => {
  const { t } = useTranslation();
  const nivel = nivelDeUso(bytes, limite);
  const porcentaje = limite > 0 ? Math.min(100, Math.round((bytes / limite) * 100)) : 0;

  return (
    <div className="space-y-1.5 rounded-md border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{titulo}</p>
        <span className="font-tabular text-xs text-muted-foreground">{porcentaje}%</span>
      </div>
      <Progress
        value={porcentaje}
        className={cn(
          "h-2",
          nivel === "critico" && "[&>div]:bg-destructive",
          nivel === "aviso" && "[&>div]:bg-warning",
        )}
      />
      <p className="font-tabular text-xs text-muted-foreground">
        {formatBytes(bytes)} {t("settings.usageOf")} {formatBytes(limite)}
        {subtitulo ? ` · ${subtitulo}` : ""}
      </p>
      {nivel !== "ok" ? (
        <p
          className={cn(
            "flex items-center gap-1.5 text-xs",
            nivel === "critico" ? "text-destructive" : "text-warning",
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {t(nivel === "critico" ? "settings.usageCritical" : "settings.usageWarning")}
        </p>
      ) : null}
    </div>
  );
};
