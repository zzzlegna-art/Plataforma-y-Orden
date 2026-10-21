import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LockOpen } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SerialScanInput } from "@/components/shared/serial-scan-input";
import { Badge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRunAction } from "@/hooks/use-run-action";
import { liberarUnitsLote } from "@/lib/actions/units";

const TONE_RESULTADO: Record<string, "success" | "warning" | "destructive" | "neutral"> = {
  liberado: "success",
  ya_liberado: "warning",
  no_encontrado: "destructive",
  no_permitido: "destructive",
};

/** Libera varios seriales del sistema a la vez pegando una lista. */
const LiberarSeriales = ({ embedded = false }: { embedded?: boolean }) => {
  const { t } = useTranslation();
  const runAction = useRunAction();
  const [motivo, setMotivo] = useState("");
  const [lista, setLista] = useState("");
  const [resultados, setResultados] = useState<Awaited<ReturnType<typeof liberarUnitsLote>> | null>(null);
  const [pendiente, setPendiente] = useState(false);

  const seriales = lista
    .split(/[\n,;]+/)
    .map((serial) => serial.trim())
    .filter(Boolean);

  const ejecutar = async () => {
    if (seriales.length === 0) return;
    setPendiente(true);
    const result = await runAction((db, actor) => liberarUnitsLote(db, actor, { imeis: seriales, motivo }));
    setPendiente(false);
    if (result) {
      setResultados(result);
      if (result.some((r) => r.resultado === "liberado")) setLista("");
    }
  };

  const liberados = resultados?.filter((r) => r.resultado === "liberado").length ?? 0;
  const conProblema = resultados ? resultados.length - liberados : 0;

  return (
    <div className="space-y-5 stagger">
      {!embedded ? <PageHeader title={t("liberar.title")} description={t("liberar.subtitle")} /> : null}

      <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
        <div className="space-y-2">
          <Label>{t("liberar.motivo")}</Label>
          <Input
            value={motivo}
            placeholder={t("liberar.motivoPlaceholder")}
            onChange={(event) => setMotivo(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("liberar.serials")}</Label>
          <Textarea
            rows={6}
            value={lista}
            placeholder={t("liberar.serialsPlaceholder")}
            onChange={(event) => setLista(event.target.value)}
            className="font-tabular"
          />
          <p className="text-xs text-muted-foreground">{t("liberar.hint")}</p>
        </div>
        <SerialScanInput
          onScan={(serial) => setLista((previous) => (previous.trim() ? `${previous.trim()}\n${serial}` : serial))}
          hint={t("liberar.scanHint")}
        />
        <ConfirmDialog
          trigger={
            <Button type="button" loading={pendiente} disabled={seriales.length === 0} className="w-full">
              <LockOpen />
              {t("liberar.action", { count: seriales.length })}
            </Button>
          }
          title={t("liberar.confirmTitle", { count: seriales.length })}
          description={t("liberar.confirmDescription")}
          confirmLabel={t("liberar.actionZero")}
          destructive
          onConfirm={ejecutar}
        />
      </section>

      {resultados ? (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge tone="success" label={t("liberar.liberados", { count: liberados })} />
            {conProblema > 0 ? (
              <Badge tone="warning" label={t("liberar.problemas", { count: conProblema })} />
            ) : null}
          </div>
          <ul className="divide-y rounded-lg border bg-card">
            {resultados.map((resultado) => (
              <li key={resultado.imei} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="font-tabular truncate text-sm">{resultado.imei}</p>
                  <p className="truncate text-xs text-muted-foreground">{resultado.detalle}</p>
                </div>
                <Badge tone={TONE_RESULTADO[resultado.resultado]} label={t(`liberar.resultado.${resultado.resultado}`)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};

export default LiberarSeriales;
