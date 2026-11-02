import { useEffect, useState } from "react";
import { ArrowLeftRight, CircleAlert, MapPinned, PackageCheck, Truck } from "lucide-react";
import {
  readMultisiteSerialTimeline,
  type SerialMultisiteTimelineItem,
} from "@/lib/nexora-transfer-history";
import { formatDateTime } from "@/lib/format";

type State = { status: "loading" | "unavailable" | "ready" | "error"; items: SerialMultisiteTimelineItem[] };

const eventIcons = {
  despachado: Truck,
  recepcion_confirmada: PackageCheck,
  faltante_reportado: CircleAlert,
  retorno_verificado: PackageCheck,
  incidencia: CircleAlert,
} as const;

/** Se muestra únicamente cuando existe la nueva bitácora y hay movimientos del IMEI. */
export const MultisiteSerialHistory = ({ unitId }: { unitId: string }) => {
  const [state, setState] = useState<State>({ status: "loading", items: [] });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", items: [] });
    void readMultisiteSerialTimeline(unitId)
      .then(({ ready, events }) => {
        if (active) setState({ status: ready ? "ready" : "unavailable", items: events });
      })
      .catch(() => {
        if (active) setState({ status: "error", items: [] });
      });
    return () => { active = false; };
  }, [unitId]);

  // La instalación sin migración conserva intacta la ficha legacy.
  if (state.status === "unavailable" || state.status === "loading") return null;
  if (state.status === "ready" && state.items.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm" aria-label="Historial multisede del IMEI">
      <header className="bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-4 text-white sm:p-5">
        <div className="flex items-center gap-2 text-sm font-bold">
          <MapPinned className="h-5 w-5 text-sky-200" aria-hidden="true" />
          Recorrido del IMEI entre ciudades
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-300">
          Traslados, recepciones y devoluciones de este serial en toda la red de Nexora.
        </p>
      </header>
      {state.status === "error" ? (
        <div role="status" className="flex gap-2 px-4 py-4 text-sm text-muted-foreground">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          No se pudo cargar el historial multisede. La información principal del serial sigue disponible.
        </div>
      ) : (
        <ol className="space-y-0 px-4 py-2 sm:px-5">
          {state.items.map((item) => {
            const Icon = eventIcons[item.type];
            const isAlert = item.type === "incidencia" || item.type === "faltante_reportado";
            return (
              <li key={item.id} className="relative border-l border-border py-3 pl-6 last:border-l-transparent">
                <span
                  aria-hidden="true"
                  className={`absolute -left-4 top-3 grid h-8 w-8 place-items-center rounded-full border bg-card ${isAlert ? "text-amber-600" : "text-primary"}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold">{item.title}</h4>
                  <span className="text-[11px] tabular-nums text-muted-foreground">{formatDateTime(item.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  <ArrowLeftRight className="h-3 w-3" aria-hidden="true" />
                  Documento {item.documentCode}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};
