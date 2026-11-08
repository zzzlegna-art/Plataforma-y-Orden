import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, MapPin, Store } from "lucide-react";
import {
  fetchSiteReadiness,
  type GlobalSiteReadiness,
} from "@/lib/nexora-site-readiness";

/**
 * Resumen de inventario multisede respaldado por el servidor.
 * El filtro de sede SOLO cambia los conteos de disponibilidad física aquí.
 * Pedidos, garantías y rankings globales no se atribuyen a una sede sin datos fiables.
 */
export const DashboardSiteOverview = () => {
  const [readiness, setReadiness] = useState<GlobalSiteReadiness | null>(null);
  const [siteId, setSiteId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchSiteReadiness()
      .then((result) => {
        if (!active) return;
        setReadiness(result);
        setError(false);
      })
      .catch(() => {
        if (!active) return;
        setReadiness(null);
        setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const selectedSite = readiness?.sites.find((site) => site.siteId === siteId);
  const counts = useMemo(
    () => selectedSite ?? (readiness?.sites.reduce(
      (total, site) => ({
        physical: total.physical + site.physical,
        candidate: total.candidate + site.candidate,
        reserved: total.reserved + site.reserved,
        restricted: total.restricted + site.restricted,
      }),
      { physical: 0, candidate: 0, reserved: 0, restricted: 0 },
    ) ?? { physical: 0, candidate: 0, reserved: 0, restricted: 0 }),
    [readiness, selectedSite],
  );

  return (
    <section className="rounded-2xl border bg-card/75 p-4 sm:p-5" aria-label="Distribución del inventario por sede">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-primary/10 p-2 text-primary"><Store className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-bold">Disponibilidad del inventario por sede</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Conteos de custodia verificada, no ventas ni autorización para vender.
            </p>
          </div>
        </div>
        {readiness?.approved && readiness.sites.length > 0 ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-4 w-4" />
            Sede
            <select
              aria-label="Filtrar disponibilidad por sede"
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
              className="h-9 max-w-[230px] rounded-md border bg-background px-2 text-sm text-foreground"
            >
              <option value="">Todas las sedes</option>
              {readiness.sites.map((site) => (
                <option key={site.siteId} value={site.siteId}>{site.siteName}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {loading ? (
        <p role="status" className="mt-4 text-xs text-muted-foreground">Consultando disponibilidad por sede…</p>
      ) : error ? (
        <p role="status" className="mt-4 text-xs text-muted-foreground">
          No fue posible consultar la disponibilidad por sede. Los demás indicadores siguen funcionando.
        </p>
      ) : !readiness?.approved ? (
        <p role="status" className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Primero se debe aprobar la conciliación del inventario multisede. No se atribuirán equipos a locales sin verificación.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Físicos en sedes", value: counts.physical },
              { label: "Sin reserva", value: counts.candidate },
              { label: "Comprometidos", value: counts.reserved },
              { label: "Restringidos", value: counts.restricted },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border bg-muted/20 px-3 py-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{value.toLocaleString("es-CO")}</p>
              </div>
            ))}
          </div>
          {!selectedSite && readiness.unmapped > 0 ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
              {readiness.unmapped.toLocaleString("es-CO")} equipos aún sin sede verificada; no están atribuidos a ningún local.
            </p>
          ) : null}
          <p className="mt-3 text-[11px] text-muted-foreground">
            El filtro de sede aplica únicamente a este bloque. Los pedidos, garantías y cifras globales no se modifican.
          </p>
        </>
      )}
    </section>
  );
};
