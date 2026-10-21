import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Archive, CheckCircle2, Trash2, Upload, XCircle } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SerialScanInput } from "@/components/shared/serial-scan-input";
import { SearchField } from "@/components/shared/search-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/use-permissions";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import { eliminarSerialPrevio, importarSerialesPrevios } from "@/lib/actions/seriales-previos";
import { formatDate } from "@/lib/format";
import { buscarSerialPrevio, listarSerialesPrevios } from "@/lib/selectors";

type Tab = "buscar" | "importar" | "lista";

/** Registro de ventas anteriores a la plataforma (seriales previos). */
const SerialesPrevios = ({ embedded = false }: { embedded?: boolean }) => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const { isAdmin } = usePermissions();

  const [tab, setTab] = useState<Tab>("buscar");
  const [buscado, setBuscado] = useState<string | null>(null);
  const [textoImportar, setTextoImportar] = useState("");
  const [resultadoImport, setResultadoImport] = useState<{ importados: number; duplicados: number } | null>(null);
  const [busquedaLista, setBusquedaLista] = useState("");

  const encontrado = useMemo(
    () => (buscado ? buscarSerialPrevio(db, buscado) : undefined),
    [db, buscado],
  );

  const lista = useMemo(() => listarSerialesPrevios(db, busquedaLista), [db, busquedaLista]);

  const importar = async () => {
    const seriales = textoImportar.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (seriales.length === 0) return;
    const result = await runAction((db2, actor) => importarSerialesPrevios(db2, actor, { seriales }));
    // Se limpia siempre que la acción corrió bien, sin importar cuántos se hayan omitido: cada
    // serial que estaba en la barra ya quedó contabilizado (importado o duplicado), así que no
    // queda nada útil que conservar y el usuario puede seguir escribiendo de inmediato.
    if (result) {
      setResultadoImport(result);
      setTextoImportar("");
    }
  };

  return (
    <div className="space-y-5 stagger">
      {!embedded ? <PageHeader title={t("serialesPrevios.title")} description={t("serialesPrevios.subtitle")} /> : null}

      <div className="flex flex-wrap gap-2">
        {(["buscar", "importar", "lista"] as Tab[]).map((option) => (
          <Button
            key={option}
            variant={tab === option ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(option)}
          >
            {t(`serialesPrevios.tab.${option}`)}
          </Button>
        ))}
      </div>

      {tab === "buscar" ? (
        <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
          <SerialScanInput onScan={setBuscado} hint={t("serialesPrevios.buscarHint")} />
          {buscado ? (
            encontrado ? (
              <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
                <p className="mt-2 font-semibold text-success">
                  {t("serialesPrevios.encontrado")}
                </p>
                <p className="font-tabular mt-1 text-sm">{encontrado.serial}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("serialesPrevios.importadoPor", {
                    fecha: formatDate(encontrado.createdAt),
                    usuario: db.users.find((u) => u.id === encontrado.createdBy)?.fullName ?? "",
                  })}
                </p>
                {encontrado.notas ? (
                  <p className="mt-1 text-xs text-muted-foreground">"{encontrado.notas}"</p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center">
                <XCircle className="mx-auto h-8 w-8 text-destructive" />
                <p className="mt-2 font-semibold text-destructive">
                  {t("serialesPrevios.noEncontrado")}
                </p>
                <p className="font-tabular mt-1 text-sm">{buscado}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("serialesPrevios.noEncontradoDetail")}
                </p>
              </div>
            )
          ) : null}
        </section>
      ) : null}

      {tab === "importar" ? (
        isAdmin ? (
          <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
            <div className="space-y-2">
              <Label>{t("serialesPrevios.importLabel")}</Label>
              <Textarea
                rows={6}
                value={textoImportar}
                placeholder={t("serialesPrevios.importPlaceholder")}
                onChange={(event) => setTextoImportar(event.target.value)}
                className="font-tabular"
              />
              <p className="text-xs text-muted-foreground">{t("serialesPrevios.importHint")}</p>
            </div>
            <Button
              type="button"
              loading={runAction.pending}
              disabled={!textoImportar.trim()}
              onClick={() => void importar()}
            >
              <Upload />
              {t("serialesPrevios.importar")}
            </Button>
            {resultadoImport ? (
              <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
                {t("serialesPrevios.imported", { count: resultadoImport.importados })}
                {resultadoImport.duplicados > 0
                  ? ` · ${t("serialesPrevios.duplicados", { count: resultadoImport.duplicados })}`
                  : ""}
              </p>
            ) : null}
          </section>
        ) : (
          <EmptyState title={t("serialesPrevios.importOnlyAdmin")} />
        )
      ) : null}

      {tab === "lista" ? (
        <div className="space-y-3">
          <SearchField
            value={busquedaLista}
            onChange={setBusquedaLista}
            placeholder={t("serialesPrevios.buscarLista")}
            className="sm:max-w-sm"
          />
          <p className="text-xs text-muted-foreground">
            {t("serialesPrevios.total", { count: lista.length })}
          </p>
          {lista.length === 0 ? (
            <EmptyState icon={Archive} title={t("serialesPrevios.empty")} description={t("serialesPrevios.emptyDescription")} />
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {lista.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="font-tabular truncate text-sm">{item.serial}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(item.createdAt)}
                      {item.notas ? ` · ${item.notas}` : ""}
                    </p>
                  </div>
                  {isAdmin ? (
                    <ConfirmDialog
                      trigger={
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive">
                          <Trash2 />
                        </Button>
                      }
                      title={t("serialesPrevios.removeTitle")}
                      description={t("serialesPrevios.removeDescription")}
                      confirmLabel={t("common.delete")}
                      destructive
                      onConfirm={() =>
                        void runAction(
                          (db2, actor) => eliminarSerialPrevio(db2, actor, { id: item.id }),
                          { success: "serialesPrevios.removed" },
                        )
                      }
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default SerialesPrevios;
