import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Search,
  ScanBarcode,
  Sparkles,
  Activity,
  Boxes,
  ClipboardList,
  Coins,
  PackagePlus,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { OrderStatusBadge, UnitStatusBadge, WarrantyStatusBadge } from "@/components/shared/status-badge";
import { PageHeader } from "@/components/shared/page-header";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { StatCard } from "@/components/shared/stat-card";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { useStore } from "@/hooks/use-store";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  DIAS_GARANTIA_CRITICA,
  DIAS_GARANTIA_ESTANCADA,
  diasSinMovimiento,
  getDashboard,
  STOCK_BAJO_CELULARES,
} from "@/lib/selectors";
import type { UnitCondition } from "@/lib/types";

import {
  firmaRankClientes,
  firmaRankProductos,
  rankDatumsDeClientes,
  rankDatumsDeProductos,
  type RankDatum,
} from "@/lib/dashboard-charts";

/** Nexora fase 2: panel premium conservando selectores y permisos originales. */
/** Gráfica de ranking con degradado Emerald Tech. */
const RankChart = ({
  data,
  gradientId,
  formatValue,
}: {
  data: RankDatum[];
  gradientId: string;
  formatValue: (value: number) => string;
}) => {
  const { t } = useTranslation();
  // Barra sobre la que está el cursor (o el dedo en móvil); null si ninguna.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // Solo se anima la entrada la primera vez que la gráfica aparece en pantalla; una
  // actualización en vivo posterior (con datos que sí cambiaron de verdad) no la repite, para
  // no volver a exponerse al problema de animaciones interrumpidas por una actualización.
  const animarEntradaRef = useRef(true);
  useEffect(() => {
    animarEntradaRef.current = false;
  }, []);
  return (
    <div className="h-56 w-full">
      {/* debounce: evita que un contenedor medido en 0×0 a mitad de una transición de página
         (por ejemplo el fade-in con el que entra el panel) se quede grabado como el tamaño
         final de la gráfica. */}
      <ResponsiveContainer width="100%" height="100%" debounce={150}>
        <BarChart
          data={data}
          margin={{ top: 16, right: 4, left: 4, bottom: 0 }}
          barCategoryGap="28%"
          onMouseMove={(state: { activeTooltipIndex?: number | string | null }) => {
            const index = state?.activeTooltipIndex;
            setActiveIndex(index === null || index === undefined ? null : Number(index));
          }}
          onMouseLeave={() => setActiveIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary-glow))" />
              <stop offset="100%" stopColor="hsl(var(--primary))" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            // dataKey="key" (no "short"): varios nombres truncados coinciden (p. ej. varios
            // "Apple iPhon…"), y Recharts identifica cada barra por el valor del eje, así que
            // con etiquetas repetidas todas las barras "encontraban" siempre la primera
            // coincidencia al pasar el cursor. La key del producto/cliente es única; el texto
            // corto solo se usa para lo que se ve dibujado.
            dataKey="key"
            tickFormatter={(key: string) => data.find((row) => row.key === key)?.short ?? ""}
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis hide />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as RankDatum;
              return (
                <div className="animate-in fade-in-0 zoom-in-95 rounded-md border bg-popover px-3 py-2 text-xs shadow-elegant duration-150">
                  <p className="font-medium">{row.name}</p>
                  <p className="font-tabular mt-0.5 font-semibold">{formatValue(row.value)}</p>
                  <p className="text-muted-foreground">
                    {t("dashboard.unitsTotal", { count: row.units })}
                  </p>
                </div>
              );
            }}
          />
          <Bar
            dataKey="value"
            fill={`url(#${gradientId})`}
            radius={[6, 6, 0, 0]}
            maxBarSize={46}
            isAnimationActive={animarEntradaRef.current}
            animationDuration={700}
            animationEasing="ease-out"
          >
            {data.map((row, index) => {
              const isActive = activeIndex === index;
              const isDimmed = activeIndex !== null && !isActive;
              return (
                <Cell
                  key={row.key}
                  style={{
                    // La barra elegida se ensancha y brilla; las demás se atenúan.
                    opacity: isDimmed ? 0.4 : 1,
                    filter: isActive ? "drop-shadow(0 0 8px hsl(var(--primary) / 0.65)) brightness(1.08)" : "none",
                    transform: isActive ? "scale(1.08, 1.03)" : "scale(1)",
                    transformBox: "fill-box",
                    transformOrigin: "bottom center",
                    transition: "opacity 200ms ease, filter 200ms ease, transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                    cursor: "pointer",
                  }}
                />
              );
            })}
            <LabelList
              dataKey="value"
              position="top"
              formatter={(value) => formatValue(Number(value))}
              style={{ fontSize: 10, fontWeight: 600, fill: "hsl(var(--foreground))" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Panel general: indicadores, rankings y alertas operativas. */
const Panel = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const { can } = usePermissions();
  const data = useMemo(() => getDashboard(db), [db]);
  // Condición que se muestra en la tarjeta de alertas de stock bajo.
  const [condicionAlerta, setCondicionAlerta] = useState<UnitCondition>("nuevo");
  const alertas = data.lowStockCelulares[condicionAlerta];
  // Garantía que más tiempo lleva sin moverse (la lista ya viene ordenada de mayor a menor).
  const garantiaMasAntigua = data.staleWarranties[0];
  const diasMasAntigua = garantiaMasAntigua ? diasSinMovimiento(garantiaMasAntigua) : 0;

  // Si los celulares todavía no tienen precio cargado, el ranking se muestra por
  // unidades: así la gráfica nunca queda vacía.
  const clientesPorMonto = data.hasAmounts;
  // `db` cambia de referencia con cualquier evento en vivo, así que los datos de la gráfica se
  // memorizan sobre una "firma" de texto (ver src/lib/dashboard-charts.ts), no sobre `data`
  // directamente: así la gráfica no recibe un arreglo "nuevo" con los mismos números a mitad de
  // su animación de entrada, que era como a veces se quedaba sin dibujar la cifra de una barra.
  const productsSignature = firmaRankProductos(data.topProducts);
  const productsChart: RankDatum[] = useMemo(
    () => rankDatumsDeProductos(data.topProducts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productsSignature],
  );
  const customersSignature = firmaRankClientes(data.topCustomers, clientesPorMonto);
  const customersChart: RankDatum[] = useMemo(
    () => rankDatumsDeClientes(data.topCustomers, clientesPorMonto),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customersSignature],
  );

  return (
    <div className="space-y-8 stagger">
      <div className="nx-dashboard-heading">
        <div>
          <div className="nx-eyebrow"><Sparkles className="h-3.5 w-3.5" /> CENTRO DE OPERACIONES</div>
          <PageHeader title="Panel principal" description="Resumen general de tu inventario y operaciones." />
        </div>
        <span className="nx-live-pill"><span className="nx-live-dot" /> Información de tu operación</span>
      </div>

      <section className="nx-hero-strip">
        <div className="nx-hero-icon"><Activity className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Bienvenido a Nexora Smart Operations</p>
          <p className="mt-1 text-xs opacity-80">Consulta tus indicadores y accede a las operaciones de tu bodega desde un solo lugar.</p>
        </div>
        <Link to="/seriales" className="nx-hero-link">Consultar seriales <ArrowRight className="h-4 w-4" /></Link>
      </section>

      <section className="nx-kpi-section">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t("dashboard.available")} value={<AnimatedNumber value={data.kpis.available} formatter={formatNumber} />} hint={t("dashboard.availableHint")} icon={Boxes} tone="success" />
          <StatCard label={t("dashboard.receivedThisMonth")} value={<AnimatedNumber value={data.kpis.receivedThisMonth} formatter={formatNumber} />} hint={t("dashboard.receivedHint")} icon={PackagePlus} tone="info" />
          <StatCard label={t("dashboard.lowStock")} value={<AnimatedNumber value={data.kpis.lowStockProducts} formatter={formatNumber} />} hint={t("dashboard.lowStockHint")} icon={TriangleAlert} tone={data.kpis.lowStockProducts > 0 ? "warning" : "success"} />
          <StatCard label={t("dashboard.inventoryValue")} value={<AnimatedNumber value={data.kpis.inventoryValue} formatter={formatCurrency} />} hint={t("dashboard.inventoryValueHint")} icon={Coins} tone="primary" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Link to="/pedidos" className="nx-wide-stat">
            <div className="nx-wide-icon"><ClipboardList className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1"><p className="nx-wide-label">{t("dashboard.openOrders")}</p><p className="nx-wide-value"><AnimatedNumber value={data.kpis.openOrders} formatter={formatNumber} /></p><p className="nx-wide-hint">{t("dashboard.openOrdersHint")}</p></div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </Link>
          <Link to="/garantias" className="nx-wide-stat">
            <div className="nx-wide-icon nx-wide-icon-blue"><ShieldCheck className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1"><p className="nx-wide-label">{t("dashboard.openWarranties")}</p><p className="nx-wide-value"><AnimatedNumber value={data.kpis.openWarranties} formatter={formatNumber} /></p><p className="nx-wide-hint">{data.kpis.staleWarranties > 0 ? t("dashboard.openWarrantiesStale", { count: data.kpis.staleWarranties, days: DIAS_GARANTIA_ESTANCADA }) : t("dashboard.openWarrantiesHint")}</p></div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        </div>
      </section>

      <section className="nx-actions-section">
        <div className="nx-section-heading"><div className="nx-section-icon"><Sparkles className="h-5 w-5" /></div><div><h2>Acciones rápidas</h2><p>Las tareas que más utilizas, siempre a un clic.</p></div></div>
        <div className="nx-action-grid">
          {can("receptions.manage") && <Link className="nx-action-tile" to="/recepcion/nueva"><span className="nx-action-icon"><PackagePlus /></span><span><strong>Nueva recepción</strong><small>Registrar mercancía</small></span><ArrowRight className="nx-action-arrow" /></Link>}
          {can("orders.manage") && <Link className="nx-action-tile" to="/pedidos"><span className="nx-action-icon nx-action-blue"><ClipboardList /></span><span><strong>Gestionar pedidos</strong><small>Ventas y despachos</small></span><ArrowRight className="nx-action-arrow" /></Link>}
          <Link className="nx-action-tile" to="/seriales"><span className="nx-action-icon nx-action-purple"><ScanBarcode /></span><span><strong>Buscar serial</strong><small>Consultar IMEI</small></span><ArrowRight className="nx-action-arrow" /></Link>
          <Link className="nx-action-tile" to="/clientes"><span className="nx-action-icon"><Users /></span><span><strong>Gestionar clientes</strong><small>Directorio comercial</small></span><ArrowRight className="nx-action-arrow" /></Link>
          <Link className="nx-action-tile" to="/garantias"><span className="nx-action-icon nx-action-gold"><ShieldCheck /></span><span><strong>Revisar garantías</strong><small>Seguimiento de casos</small></span><ArrowRight className="nx-action-arrow" /></Link>
        </div>
      </section>

      {garantiaMasAntigua && (
        <div
          role="alert"
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3",
            diasMasAntigua >= DIAS_GARANTIA_CRITICA
              ? "border-destructive/40 bg-destructive/10"
              : "border-warning/40 bg-warning/10",
          )}
        >
          <TriangleAlert
            className={cn(
              "h-5 w-5 shrink-0",
              diasMasAntigua >= DIAS_GARANTIA_CRITICA ? "text-destructive" : "text-warning",
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {t("dashboard.staleWarrantiesTitle", { count: data.staleWarranties.length })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.staleWarrantiesBody", {
                days: DIAS_GARANTIA_ESTANCADA,
                code: garantiaMasAntigua.warranty.code,
                oldest: diasMasAntigua,
              })}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/garantias">{t("dashboard.staleWarrantiesView")}</Link>
          </Button>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Rendimiento de inventario</h2>
          <p className="text-sm text-muted-foreground">Productos y clientes con mayor movimiento.</p>
        </div>
      </div>
      <div className="nx-ranking-grid grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="min-w-0 premium-surface nx-ranking-card p-6 transition-shadow hover:shadow-md">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-primary/12 p-1.5 text-primary">
                <TrendingUp className="h-3.5 w-3.5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">{t("dashboard.topProductsTitle")}</h3>
                <p className="text-xs text-muted-foreground">{t("dashboard.topProductsSubtitle")}</p>
              </div>
            </div>
            <Link to="/inventario" className="text-xs text-primary hover:underline">
              {t("common.viewAll")}
            </Link>
          </div>
          {data.topProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("dashboard.noSalesRanking")}
            </p>
          ) : (
            <RankChart
              data={productsChart}
              gradientId="rankProducts"
              formatValue={(value) => formatNumber(value)}
            />
          )}
        </section>

        <section className="min-w-0 premium-surface nx-ranking-card p-6 transition-shadow hover:shadow-md">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-info/15 p-1.5 text-info">
                <Users className="h-3.5 w-3.5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">{t("dashboard.topCustomersTitle")}</h3>
                <p className="text-xs text-muted-foreground">
                  {clientesPorMonto
                    ? t("dashboard.topCustomersSubtitle")
                    : t("dashboard.topCustomersSubtitleUnits")}
                </p>
              </div>
            </div>
            <Link to="/clientes" className="text-xs text-primary hover:underline">
              {t("common.viewAll")}
            </Link>
          </div>
          {data.topCustomers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("dashboard.noSalesRanking")}
            </p>
          ) : (
            <RankChart
              data={customersChart}
              gradientId="rankCustomers"
              formatValue={(value) =>
                clientesPorMonto ? formatCurrency(value) : formatNumber(value)
              }
            />
          )}
        </section>
      </div>

      <div className="nx-operational-grid grid gap-4 lg:grid-cols-3">
        <section className="premium-surface nx-operation-card p-5">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("dashboard.alertsLowStock")}</h3>
            <Link to="/inventario" className="text-xs text-primary hover:underline">
              {t("common.viewAll")}
            </Link>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            {t("dashboard.lowStockSubtitle", { count: STOCK_BAJO_CELULARES })}
          </p>

          <div className="mb-3 flex gap-2" role="group" aria-label={t("dashboard.alertsLowStock")}>
            {(["nuevo", "seminuevo"] as const).map((condicion) => {
              const activa = condicionAlerta === condicion;
              return (
                <Button
                  key={condicion}
                  type="button"
                  size="sm"
                  variant={activa ? "default" : "outline"}
                  aria-pressed={activa}
                  onClick={() => setCondicionAlerta(condicion)}
                  className="flex-1"
                >
                  {t(`condition.${condicion}`)}
                  <span
                    className={cn(
                      "font-tabular rounded-full px-1.5 text-xs",
                      activa ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {data.lowStockCelulares[condicion].length}
                  </span>
                </Button>
              );
            })}
          </div>

          {alertas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t(
                condicionAlerta === "nuevo"
                  ? "dashboard.noLowStockNuevo"
                  : "dashboard.noLowStockSeminuevo",
                { count: STOCK_BAJO_CELULARES },
              )}
            </p>
          ) : (
            <ul className="max-h-64 divide-y overflow-y-auto pr-1">
              {alertas.map(({ row, disponible }) => (
                <li key={row.product.id} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    to={`/inventario/${row.product.id}`}
                    className="min-w-0 flex-1 truncate text-sm transition-colors hover:text-primary hover:underline"
                  >
                    {row.product.name}
                  </Link>
                  <span
                    className={cn(
                      "font-tabular shrink-0 text-xs font-medium",
                      disponible === 0 ? "text-destructive" : "text-warning",
                    )}
                  >
                    {t("dashboard.lowStockUnits", { count: disponible })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {data.lowStockOtros.length > 0 ? (
            <div className="mt-3 border-t pt-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("dashboard.lowStockOthers")}
              </p>
              <ul className="divide-y">
                {data.lowStockOtros.slice(0, 5).map((row) => (
                  <li key={row.product.id} className="flex items-center justify-between gap-3 py-2">
                    <Link
                      to={`/inventario/${row.product.id}`}
                      className="min-w-0 flex-1 truncate text-sm transition-colors hover:text-primary hover:underline"
                    >
                      {row.product.name}
                    </Link>
                    <span className="font-tabular shrink-0 text-xs text-warning">
                      {t("product.stockOf", {
                        available: row.stock.disponible,
                        min: row.stock.minStock,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="premium-surface nx-operation-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("dashboard.openOrders")}</h3>
            <Link to="/pedidos" className="text-xs text-primary hover:underline">
              {t("common.viewAll")}
            </Link>
          </div>
          {data.openOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("dashboard.noOpenOrders")}
            </p>
          ) : (
            <ul className="divide-y">
              {data.openOrders.slice(0, 5).map((view) => (
                <li key={view.order.id} className="flex items-center justify-between gap-3 py-2">
                  <Link to={`/pedidos/${view.order.id}`} className="min-w-0 flex-1 transition-colors hover:text-primary">
                    <p className="truncate text-sm font-medium">{view.order.code}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {view.customer?.name ?? "—"}
                    </p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-tabular text-xs text-muted-foreground">
                      {view.assigned}/{view.requested}
                    </span>
                    <OrderStatusBadge status={view.order.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="premium-surface nx-operation-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("dashboard.openWarranties")}</h3>
            <Link to="/garantias" className="text-xs text-primary hover:underline">
              {t("common.viewAll")}
            </Link>
          </div>
          {data.openWarranties.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("dashboard.noOpenWarranties")}
            </p>
          ) : (
            <ul className="divide-y">
              {data.openWarranties.slice(0, 5).map((view) => {
                const dias = diasSinMovimiento(view);
                return (
                  <li key={view.warranty.id} className="flex items-center justify-between gap-3 py-2">
                    <Link to={`/garantias/${view.warranty.id}`} className="min-w-0 flex-1 transition-colors hover:text-primary">
                      <p className="truncate text-sm font-medium">{view.warranty.code}</p>
                      <p className="font-tabular truncate text-xs text-muted-foreground">
                        {view.unit?.serial ?? "—"}
                      </p>
                    </Link>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <WarrantyStatusBadge status={view.warranty.status} />
                      <span
                        className={cn(
                          "font-tabular text-[11px]",
                          dias >= DIAS_GARANTIA_CRITICA
                            ? "font-medium text-destructive"
                            : dias >= DIAS_GARANTIA_ESTANCADA
                              ? "font-medium text-warning"
                              : "text-muted-foreground",
                        )}
                      >
                        {t("dashboard.daysWithoutMovement", { count: dias })}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="premium-surface nx-operation-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("dashboard.unitsTitle")}</h3>
          <Link to="/unidades" className="text-xs text-primary hover:underline">
            {t("common.viewAll")}
            <ArrowRight className="ml-1 inline h-3 w-3" />
          </Link>
        </div>
        <ul className="divide-y">
          {db.units.slice(0, 6).map((unit) => {
            const product = db.products.find((item) => item.id === unit.productId);
            return (
              <li key={unit.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="font-tabular truncate text-sm">{unit.serial}</p>
                  <p className="truncate text-xs text-muted-foreground">{product?.name ?? "—"}</p>
                </div>
                <UnitStatusBadge status={unit.status} />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

export default Panel;