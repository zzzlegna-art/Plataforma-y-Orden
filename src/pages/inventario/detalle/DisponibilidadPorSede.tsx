import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, MapPinned, ShieldCheck, Store, Truck, Warehouse } from "lucide-react";

import { groupProductAvailability } from "@/lib/nexora-availability";
import { listCities, listSites, type NexoraCity, type NexoraSite } from "@/lib/nexora-sites";
import type { Unit } from "@/lib/types";

type Catalogue = { cities: NexoraCity[]; sites: NexoraSite[] };
const formatCount = (n: number) => n.toLocaleString("es-CO");

/**
 * Vista de existencias conectadas entre sedes.
 * No asigna ubicaciones ni afecta ventas, recepciones o traslados.
 */
export const DisponibilidadPorSede = ({
  units,
  excludedWarrantyIds,
  preparedUnitIds,
}: {
  units: Unit[];
  excludedWarrantyIds: ReadonlySet<string>;
  preparedUnitIds: ReadonlySet<string>;
}) => {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([listCities(), listSites()])
      .then(([cities, sites]) => {
        if (!active) return;
        setCatalogue({ cities, sites });
        setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => { active = false; };
  }, []);

  const summary = useMemo(
    () => catalogue
      ? groupProductAvailability(
          units, catalogue.cities, catalogue.sites, preparedUnitIds, excludedWarrantyIds,
        )
      : null,
    [units, catalogue, preparedUnitIds, excludedWarrantyIds],
  );

  const cityGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof summary>["rows"]>();
    for (const row of summary?.rows ?? []) {
      const key = row.cityId;
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
    return [...groups.entries()].map(([id, rows]) => ({
      id, name: rows[0].cityName,
      total: rows.reduce((value, row) => value + row.available, 0),
      rows,
    }));
  }, [summary]);

  return (
    <section aria-label="Disponibilidad por sedes" className="overflow-hidden rounded-2xl border bg-card shadow-[0_16px_40px_-30px_rgba(15,39,64,.32)]">
      <div className="relative overflow-hidden border-b bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 px-5 py-5 text-white sm:px-6">
        <div aria-hidden="true" className="absolute -right-8 -top-20 h-44 w-44 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-white/10 bg-white/10 p-2.5">
              <MapPinned className="h-5 w-5 text-sky-200" aria-hidden="true" />
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200">
                Red de inventarios · Nexora 2.0
              </div>
              <h2 className="text-lg font-bold tracking-tight sm:text-xl">Disponibilidad por ciudad y sede</h2>
              <p className="mt-1 max-w-lg text-xs leading-relaxed text-slate-300">
                Consulta dónde están físicamente los equipos de esta referencia. Cada sede refleja solo unidades verificadas.
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-right backdrop-blur">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-300">Disponible ubicado</p>
            <strong className="text-2xl font-bold tabular-nums">
              {summary ? formatCount(summary.availableAssigned) : "—"}
            </strong>
          </div>
        </div>
      </div>

      {error ? (
        <div role="status" className="flex gap-3 px-5 py-5 text-sm text-muted-foreground sm:px-6">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
          <p>
            La red de sedes aún no está habilitada. El inventario actual sigue disponible
            en la sección principal; esta vista se activará después de verificar la estructura multisede.
          </p>
        </div>
      ) : !summary ? (
        <p role="status" className="px-5 py-6 text-sm text-muted-foreground sm:px-6">Consultando la distribución empresarial…</p>
      ) : (
        <div className="space-y-4 p-4 sm:p-5">
          {cityGroups.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {cityGroups.map((city) => (
                <article key={city.id} className="overflow-hidden rounded-xl border bg-background">
                  <div className="flex items-center justify-between gap-2 border-b bg-muted/25 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
                      <h3 className="font-semibold">{city.name}</h3>
                    </div>
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold tabular-nums text-primary">
                      {formatCount(city.total)} disponibles
                    </span>
                  </div>
                  <div className="divide-y px-4">
                    {city.rows.map((row) => {
                      const Icon = row.kind === "local" ? Store : Warehouse;
                      return (
                        <div key={row.siteId} className="flex items-center gap-3 py-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/60 text-muted-foreground">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{row.siteName}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.kind === "local" ? "Local comercial" : row.kind === "principal" ? "Sede principal" : "Bodega regional"}
                            </p>
                          </div>
                          <span className="shrink-0 font-tabular text-lg font-bold">{formatCount(row.available)}</span>
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed bg-muted/20 p-5 text-center text-sm text-muted-foreground">
              Todavía no hay existencias asignadas a una sede verificada para esta referencia.
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <div><strong className="font-tabular text-sm">{formatCount(summary.awaitingPhysicalCount)}</strong>
                <p className="text-xs text-muted-foreground">Unidades sin sede conciliada</p></div>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl border bg-muted/20 px-3 py-3">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div><strong className="font-tabular text-sm">{formatCount(summary.inTransit)}</strong>
                <p className="text-xs text-muted-foreground">Unidades en tránsito (no disponibles)</p></div>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl border bg-muted/20 px-3 py-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div><strong className="font-tabular text-sm">{formatCount(summary.preparedForDispatch)}</strong>
                <p className="text-xs text-muted-foreground">Preparadas para despacho (no disponibles)</p></div>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Esta consulta no autoriza vender ni trasladar productos de otras sedes.
            Las unidades anteriores a la migración conservarán su ubicación pendiente
            hasta confirmar el conteo físico y su IMEI.
          </p>
        </div>
      )}
    </section>
  );
};
