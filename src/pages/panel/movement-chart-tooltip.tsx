import { formatNumber } from "@/lib/format";

/** Mismas series que aparecen en la gráfica y en la leyenda; sin cifras inventadas. */
export const MOVEMENT_SERIES = [
  { key: "entradas", label: "Entradas", tone: "entries" },
  { key: "salidas", label: "Salidas", tone: "exits" },
  { key: "asignaciones", label: "Asignaciones", tone: "assignments" },
] as const;

type MovementTooltipPayload = { dataKey?: unknown; value?: unknown };

export const MovementChartTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: readonly MovementTooltipPayload[];
  label?: unknown;
}) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="nx-movement-tooltip" role="tooltip">
      <div className="nx-movement-tooltip__header">
        <span className="nx-movement-tooltip__eyebrow">MOVIMIENTOS DEL PERÍODO</span>
        <strong>{String(label ?? "")}</strong>
      </div>
      <div className="nx-movement-tooltip__rows">
        {MOVEMENT_SERIES.map((series) => {
          const entry = payload.find((item) => item.dataKey === series.key);
          const value = Number(entry?.value);
          return (
            <div className="nx-movement-tooltip__row" key={series.key}>
              <span className={"nx-movement-tooltip__label nx-movement-tone--" + series.tone}>
                <span className="nx-movement-legend__dot" aria-hidden="true" />
                {series.label}
              </span>
              <strong className="nx-movement-tooltip__number">
                {entry && Number.isFinite(value) ? formatNumber(value) : "—"}
              </strong>
            </div>
          );
        })}
      </div>
      <p className="nx-movement-tooltip__note">Actividad de inventario, no ventas.</p>
    </div>
  );
};
