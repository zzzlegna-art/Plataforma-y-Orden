import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Boxes, ClipboardCheck, LockKeyhole, PackageCheck, RefreshCw, ShieldAlert, Store, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchProductReadiness, fetchSiteReadiness,
  type GlobalSiteReadiness, type ProductReadiness } from "@/lib/nexora-site-readiness";

const formatter = new Intl.NumberFormat("es-CO");
const fmt = (n: number) => formatter.format(n);
export const DisponibilidadPorSedePanel = () => {
  const [report, setReport] = useState<GlobalSiteReadiness | null>(null);
  const [siteId, setSiteId] = useState("");
  const [products, setProducts] = useState<ProductReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const next = useRef(0);
  const nextProducts = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++next.current;
    setLoading(true);
    try {
      const data = await fetchSiteReadiness();
      if (request !== next.current) return;
      setReport(data);
    } catch (error) {
      if (request === next.current) {
        setReport(null);
        toast.error(error instanceof Error ? error.message : "No fue posible calcular la disponibilidad.");
      }
    } finally {
      if (request === next.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { next.current += 1; };
  }, [refresh]);

  const site = report?.sites.find((s) => s.siteId === siteId) ?? report?.sites[0];
  const effectiveSiteId = site?.siteId ?? "";

  useEffect(() => {
    const request = ++nextProducts.current;
    setProducts([]);
    if (!report?.approved || !effectiveSiteId) return;
    setLoadingProducts(true);
    void fetchProductReadiness(effectiveSiteId).then((data) => {
      if (request === nextProducts.current) setProducts(data);
    }).catch((error: unknown) => {
      if (request === nextProducts.current)
        toast.error(error instanceof Error ? error.message : "No fue posible consultar las referencias.");
    }).finally(() => {
      if (request === nextProducts.current) setLoadingProducts(false);
    });
    return () => { nextProducts.current += 1; };
  }, [report, effectiveSiteId]);

  const totals = report?.sites.reduce((sum, s) => ({
    candidates: sum.candidates + s.candidate,
    reserved: sum.reserved + s.reserved,
    restricted: sum.restricted + s.restricted,
  }), { candidates: 0, reserved: 0, restricted: 0 }) ?? {
    candidates: 0, reserved: 0, restricted: 0,
  };

  return (
    <section className="space-y-5" aria-label="Disponibilidad comercial por sede">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-primary/10 p-3 text-primary"><Boxes className="h-6 w-6" /></span>
            <div className="max-w-2xl">
              <h2 className="text-lg font-bold tracking-tight">Disponibilidad por sede</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Visibilidad consolidada: descontamos IMEI comprometidos con pedidos y excluimos
                equipos en tránsito, faltantes y estados no vendibles.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        </div>
        {!report?.approved ? (
          <div className="flex items-start gap-3 p-6">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Inventario multisede todavía no habilitado</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Antes de calcular cantidades por local debes registrar las sedes, verificar físicamente
                los IMEI y aprobar el inventario inicial. No se atribuyen equipos a sedes inexistentes.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 xl:grid-cols-5 sm:p-6">
              {[
                { label: "Candidatos sin reserva", value: totals.candidates, icon: PackageCheck },
                { label: "Comprometidos en pedidos", value: totals.reserved, icon: ClipboardCheck },
                { label: "Estados restringidos", value: totals.restricted, icon: LockKeyhole },
                { label: "En tránsito", value: report.inTransit, icon: Truck },
                { label: "Retorno pendiente", value: report.returnPending, icon: AlertTriangle },
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <div key={metric.label} className="rounded-xl border bg-muted/20 p-3 sm:p-4">
                    <Icon className="mb-2 h-4 w-4 text-primary" />
                    <p className="text-2xl font-bold tabular-nums">{fmt(metric.value)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{metric.label}</p>
                  </div>
                );
              })}
            </div>

            <div className="border-t p-5 sm:p-6">
              <h3 className="flex items-center gap-2 font-semibold"><Store className="h-4 w-4 text-primary" /> Puntos físicos</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {report.sites.map((s) => (
                  <button type="button" key={s.siteId}
                    onClick={() => setSiteId(s.siteId)}
                    aria-pressed={s.siteId === effectiveSiteId}
                    className={`rounded-xl border p-4 text-left transition hover:border-primary/60 hover:bg-muted/20 ${s.siteId === effectiveSiteId ? "border-primary bg-primary/5" : ""}`}>
                    <div className="flex justify-between gap-2">
                      <p className="font-semibold">{s.siteName}</p>
                      <span className="text-xs text-muted-foreground">{s.siteType === "principal" ? "Principal" : s.siteType === "bodega" ? "Bodega" : "Local"}</span>
                    </div>
                    <p className="mt-3 text-2xl font-bold tabular-nums">{fmt(s.candidate)}</p>
                    <p className="text-xs text-muted-foreground">Candidatos sin reserva</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {fmt(s.physical)} físicos · {fmt(s.reserved)} reservados · {fmt(s.restricted)} restringidos
                    </p>
                  </button>
                ))}
              </div>
            </div>
            {report.unmapped > 0 ? (
              <p className="mx-5 mb-5 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300 sm:mx-6">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {fmt(report.unmapped)} unidades del inventario anterior no tienen ubicación multisede verificada.
                No se contarán dentro de ningún local.
              </p>
            ) : null}
            {site ? (
              <div className="border-t p-5 sm:p-6">
                <h3 className="font-semibold">Referencias en {site.siteName}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Organizadas por modelo; la lista es informativa y no autoriza una venta.
                </p>
                {loadingProducts ? (
                  <p role="status" className="mt-4 text-sm text-muted-foreground">Calculando referencias...</p>
                ) : products.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">Sin equipos atribuidos a este punto.</p>
                ) : (
                  <div className="mt-4 overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[420px] text-sm">
                      <thead className="bg-muted/30 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Producto</th>
                          <th className="px-4 py-3 text-right font-semibold">Sin reserva</th>
                          <th className="px-4 py-3 text-right font-semibold">Reservados</th>
                          <th className="px-4 py-3 text-right font-semibold">Restringidos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((p) => (
                          <tr key={p.productId ?? p.productName} className="border-t">
                            <td className="px-4 py-3 font-medium">{p.productName}</td>
                            <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmt(p.candidate)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmt(p.reserved)}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmt(p.restricted)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
        <div className="flex items-start gap-2 border-t bg-muted/10 p-5 text-xs text-muted-foreground sm:px-6">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
          Estos conteos NO son autorización para vender. El POS deberá usar su propia operación
          transaccional con validación de sede, rol y reserva por IMEI. Mientras tanto,
          las protecciones del servidor bloquean ventas o reservas legacy de unidades en traslado.
        </div>
      </div>
    </section>
  );
};
