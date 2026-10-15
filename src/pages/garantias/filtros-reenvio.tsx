import { FilterX } from "lucide-react";
import { useTranslation } from "react-i18next";

import { OptionSelect } from "@/components/shared/option-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SEARCH_INPUT_PROPS } from "@/lib/search-input";
import type { WarrantyResolution } from "@/lib/types";
import type { WarrantyOrigin } from "@/lib/warranty-origin";
import { type FiltroReenvio, FILTRO_REENVIO_VACIO, hayFiltroReenvio } from "@/lib/warranty-reenvio";

const RESOLUCIONES: WarrantyResolution[] = ["reparado", "cambio", "sin_falla", "defectuoso"];
const ORIGENES: WarrantyOrigin[] = ["normal", "previa", "falla_inventario"];

/**
 * Filtros de la pestaña Reenvío. Lo que se filtra aquí es exactamente lo que se exporta a
 * PDF y Excel: la lista de la pantalla y la de los archivos salen de los mismos filtros.
 */
export const FiltrosReenvio = ({
  filtro,
  onChange,
  tecnicos,
  total,
  mostrados,
}: {
  filtro: FiltroReenvio;
  onChange: (siguiente: FiltroReenvio) => void;
  tecnicos: { id: string; nombre: string }[];
  /** Casos pendientes de reenvío sin filtrar. */
  total: number;
  /** Casos que cumplen los filtros. */
  mostrados: number;
}) => {
  const { t } = useTranslation();
  const set = (parcial: Partial<FiltroReenvio>) => onChange({ ...filtro, ...parcial });
  const activo = hayFiltroReenvio(filtro);

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">
      <Input
        {...SEARCH_INPUT_PROPS}
        value={filtro.texto}
        placeholder={t("warranty.reenvio.search")}
        onChange={(event) => set({ texto: event.target.value })}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <OptionSelect
          value={filtro.resolucion}
          onChange={(valor) => set({ resolucion: valor as FiltroReenvio["resolucion"] })}
          emptyLabel={t("warranty.reenvio.todasResoluciones")}
          options={RESOLUCIONES.map((valor) => ({
            value: valor,
            label: t(`warrantyResolution.${valor}`),
          }))}
        />
        <OptionSelect
          value={filtro.origen}
          onChange={(valor) => set({ origen: valor as FiltroReenvio["origen"] })}
          emptyLabel={t("warranty.reenvio.todosOrigenes")}
          options={ORIGENES.map((valor) => ({
            value: valor,
            label: t(`warranty.origin.${valor}`),
          }))}
        />
        <OptionSelect
          value={filtro.tecnicoId}
          onChange={(valor) => set({ tecnicoId: valor })}
          emptyLabel={t("warranty.reenvio.todosTecnicos")}
          options={tecnicos.map((tecnico) => ({ value: tecnico.id, label: tecnico.nombre }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("export.desde")}</Label>
          <Input
            type="date"
            value={filtro.desde}
            max={filtro.hasta || undefined}
            onChange={(event) => set({ desde: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("export.hasta")}</Label>
          <Input
            type="date"
            value={filtro.hasta}
            min={filtro.desde || undefined}
            onChange={(event) => set({ hasta: event.target.value })}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t("warranty.reenvio.mostrando", { count: mostrados, total })}
        </p>
        {activo ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(FILTRO_REENVIO_VACIO)}>
            <FilterX />
            {t("warranty.reenvio.limpiar")}
          </Button>
        ) : null}
      </div>
    </div>
  );
};
