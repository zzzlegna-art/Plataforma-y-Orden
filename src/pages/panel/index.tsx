import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Search,
  Sparkles,
  Activity,
  Boxes,
  ClipboardList,
  Coins,
  Download,
  FileSpreadsheet,
  PackagePlus,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Clock3,
  Truck,
  Wrench,
  Inbox,
  BarChart3,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
} from "recharts";

import { OrderStatusBadge, UnitStatusBadge, WarrantyStatusBadge } from "@/components/shared/status-badge";
import { PageHeader } from "@/components/shared/page-header";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { StatCard } from "@/components/shared/stat-card";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useStore } from "@/hooks/use-store";
import { formatCurrency, formatNumber } from "@/lib/format";
import { crearCsv } from "@/lib/csv";
import { exportExcel } from "@/lib/export";
import { buildOperationalReportSheets } from "@/lib/dashboard-report";
import { buildDashboardMovementChartData, getLocalDateInputValue, isWithinDateRange } from "@/lib/dashboard-date-range";
import {
  DIAS_GARANTIA_CRITICA,
  DIAS_GARANTIA_ESTANCADA,
  diasSinMovimiento,
  getDashboard,
  STOCK_BAJO_CELULARES,
} from "@/lib/selectors";
import type { UnitCondition } from "@/lib/types";
import { RankChart } from "./rank-chart";
import "./panel-premium.css";

import {
  firmaRankClientes,
  firmaRankProductos,
  rankDatumsDeClientes,
  rankDatumsDeProductos,
  type RankDatum,
} from "@/lib/dashboard-charts";

/** Panel general: indicadores, rankings y alertas operativas. */
const Panel = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const data = useMemo(() => getDashboard(db), [db]);
  const receivedTrend = (() => {
    const current = data.kpis.receivedThisMonth;
    const previous = data.kpis.receivedPreviousComparablePeriod;
    if (previous === 0) {
      return current > 0
        ? { label: t("dashboard.comparisonNew"), tone: "positive" as const }
        : { label: "—", tone: "neutral" as const };
    }
    const percent = Math.round(((current - previous) / previous) * 100);
    if (percent > 0) {
      return { label: `+${percent}%`, tone: "positive" as const };
    }
    if (percent < 0) {
      return { label: `−${Math.abs(percent)}%`, tone: "negative" as const };
    }
    return { label: "0%", tone: "neutral" as const };
  })();
  // Condición que se muestra en la tarjeta de alertas de stock bajo.
  const [condicionAlerta, setCondicionAlerta] = useState<UnitCondition>("nuevo");
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockBusqueda, setStockBusqueda] = useState("");
  const [stockCategoria, setStockCategoria] = useState("todos");
  const alertas = data.lowStockCelulares[condicionAlerta];
  const tiposProducto = useMemo(() => new Map(db.productTypes.map((tipo) => [tipo.key, tipo.name])), [db.productTypes]);
  const filasStockBajo = useMemo(() => {
    const filas = [
      ...data.lowStockCelulares.nuevo.map(({ row, disponible }) => ({ row, disponible, condicion: "Nuevo", minimo: STOCK_BAJO_CELULARES })),
      ...data.lowStockCelulares.seminuevo.map(({ row, disponible }) => ({ row, disponible, condicion: "Seminuevo", minimo: STOCK_BAJO_CELULARES })),
      ...data.lowStockOtros.map((row) => ({ row, disponible: row.stock.disponible, condicion: "Todas", minimo: row.stock.minStock })),
    ];
    return filas.sort((a, b) => a.disponible - b.disponible || a.row.product.name.localeCompare(b.row.product.name, "es"));
  }, [data]);
  const categoriasStockBajo = [...new Set(filasStockBajo.map(({ row }) => row.product.categoria || "otros"))];
  const filasStockVisibles = filasStockBajo.filter(({ row }) => {
    const coincideCategoria = stockCategoria === "todos" || (row.product.categoria || "otros") === stockCategoria;
    const termino = stockBusqueda.trim().toLocaleLowerCase("es");
    return coincideCategoria && (!termino || row.product.name.toLocaleLowerCase("es").includes(termino) || row.product.sku.toLocaleLowerCase("es").includes(termino));
  });
  const exportarStockFiltrado = () => {
    if (filasStockVisibles.length === 0) return;
    const cabeceras = ["Referencia", "SKU", "Categoria", "Condicion", "Disponibles", "Minimo", "Faltan"];
    const filas = filasStockVisibles.map(({ row, disponible, condicion, minimo }) => [
      row.product.name,
      row.product.sku,
      tiposProducto.get(row.product.categoria || "") ?? row.product.categoria ?? "Otros",
      condicion,
      disponible,
      minimo,
      Math.max(0, minimo - disponible),
    ]);
    const csv = crearCsv([cabeceras, ...filas]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = "nexora-stock-bajo-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const [reporteDesde, setReporteDesde] = useState(() => getLocalDateInputValue().slice(0, 7) + "-01");
  const [reporteHasta, setReporteHasta] = useState(() => getLocalDateInputValue());
  const [movementPreset, setMovementPreset] = useState<"month" | "7d" | "30d" | "90d" | "custom">("month");
  const changeMovementPreset = (next: "month" | "7d" | "30d" | "90d" | "custom") => {
    setMovementPreset(next);
    if (next === "custom") return;
    const now = new Date();
    setReporteHasta(getLocalDateInputValue(now));
    if (next === "month") {
      setReporteDesde(getLocalDateInputValue(now).slice(0, 7) + "-01");
    } else {
      const days = next === "7d" ? 7 : next === "30d" ? 30 : 90;
      const from = new Date(now);
      from.setDate(from.getDate() - (days - 1));
      setReporteDesde(getLocalDateInputValue(from));
    }
  };
  const dentroPeriodoReporte = (fecha: string) => isWithinDateRange(fecha, reporteDesde, reporteHasta);

  const exportarReporteOperativo = () => {
    if (reporteDesde && reporteHasta && reporteDesde > reporteHasta) return;
    const movimientos = db.movements.filter((m) => dentroPeriodoReporte(m.createdAt));
    const filas: (string | number)[][] = [
      ["Indicador", "Cantidad"],
      ["Entradas", movimientos.filter((m) => m.type === "entrada").reduce((n, m) => n + m.quantity, 0)],
      ["Salidas", movimientos.filter((m) => m.type === "salida").reduce((n, m) => n + m.quantity, 0)],
      ["Devoluciones", movimientos.filter((m) => m.type === "devolucion").reduce((n, m) => n + m.quantity, 0)],
      ["Recepciones", db.receptions.filter((r) => dentroPeriodoReporte(r.receivedAt)).length],
      ["Pedidos", db.orders.filter((o) => dentroPeriodoReporte(o.orderDate)).length],
      ["Garantías recibidas", db.warranties.filter((w) => dentroPeriodoReporte(w.receivedAt)).length],
      ["Garantías cerradas", db.warranties.filter((w) => w.resolvedAt && dentroPeriodoReporte(w.resolvedAt)).length],
      [],
      ["Fecha", "Movimiento", "Cantidad", "Referencia", "Serial"],
      ...movimientos.map((m) => [m.createdAt, m.type, m.quantity, m.referenceType, db.units.find((u) => u.id === m.unitId)?.serial ?? ""]),
    ];
    const csv = crearCsv(filas);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexora-reporte-operativo-" + reporteDesde + "-a-" + reporteHasta + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportarReporteOperativoExcel = () => {
    if (reporteDesde && reporteHasta && reporteDesde > reporteHasta) return;
    exportExcel({
      filename: `nexora-reporte-operativo-${reporteDesde || "inicio"}-a-${reporteHasta || "hoy"}.xlsx`,
      sheets: buildOperationalReportSheets(db, reporteDesde, reporteHasta),
    });
  };
  // Garantía que más tiempo lleva sin moverse (la lista ya viene ordenada de mayor a menor).
  const garantiaMasAntigua = data.staleWarranties[0];
  const diasMasAntigua = garantiaMasAntigua ? diasSinMovimiento(garantiaMasAntigua) : 0;

  const prioridadesGarantia = useMemo(() => {
    const abiertos = data.openWarranties.map((view) => ({ view, dias: diasSinMovimiento(view) }));
    return {
      criticas: abiertos.filter(({ dias }) => dias >= DIAS_GARANTIA_CRITICA),
      estancadas: abiertos.filter(({ dias }) => dias >= DIAS_GARANTIA_ESTANCADA && dias < DIAS_GARANTIA_CRITICA),
      listas: abiertos.filter(({ view }) => view.warranty.status === "reenvio_pendiente"),
      tecnico: abiertos.filter(({ view }) => view.warranty.status === "en_servicio_tecnico"),
    };
  }, [data.openWarranties]);
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

  // La gráfica comparte el filtro inclusivo de los informes y conserva rangos largos completos.
  const movementChartData = useMemo(
    () => buildDashboardMovementChartData(db.movements, reporteDesde, reporteHasta),
    [db.movements, reporteDesde, reporteHasta],
  );
  const operationalChartData = [
    { name: "Pedidos abiertos", value: data.kpis.openOrders, color: "#3b82f6" },
    { name: "Garantías abiertas", value: data.kpis.openWarranties, color: "#8b5cf6" },
    { name: "Stock bajo", value: data.kpis.lowStockProducts, color: "#f59e0b" },
    { name: "Recibidas este mes", value: data.kpis.receivedThisMonth, color: "#06b6d4" },
  ];
  const operationalChartTotal = operationalChartData.reduce((total, item) => total + item.value, 0);

  return (
    <div className="space-y-7 stagger nx-dashboard-premium nx-dashboard-showcase">
      {/* 1 · Resumen de la operación: indicadores y accesos principales. */}
      <section className="nx-dashboard-block nx-dashboard-block--summary space-y-5" aria-label="Resumen de la operación">
      <div className="nx-dashboard-heading nx-dashboard-summary-heading">
        <div>
          <div className="nx-eyebrow"><Sparkles className="h-3.5 w-3.5" /> CENTRO DE OPERACIONES</div>
          <PageHeader title="Resumen de la operación" description="Indicadores actuales de inventario, pedidos y garantías." />
        </div>
        <span className="nx-live-pill"><span className="nx-live-dot" /> Información de tu operación</span>
      </div>

      <section className="nx-kpi-section">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("dashboard.available")} value={<AnimatedNumber value={data.kpis.available} formatter={formatNumber} />} hint={t("dashboard.availableHint")} icon={Boxes} tone="success" premium />
          <StatCard label={t("dashboard.receivedThisMonth")} value={<AnimatedNumber value={data.kpis.receivedThisMonth} formatter={formatNumber} />} hint={`${t("dashboard.receivedHint")} · ${t("dashboard.comparisonPeriod")}`} icon={PackagePlus} tone="info" trend={receivedTrend.label} trendTone={receivedTrend.tone} premium />
          <button
            type="button"
            onClick={() => setStockDialogOpen(true)}
            aria-label="Ver detalle de productos con stock bajo"
            className="block w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 [&_.nx-premium-stat-card]:h-full [&_.nx-premium-stat-card]:cursor-pointer [&_.nx-premium-stat-card]:hover:border-primary/40"
          >
            <StatCard label={t("dashboard.lowStock")} value={<AnimatedNumber value={data.kpis.lowStockProducts} formatter={formatNumber} />} hint={t("dashboard.lowStockHint")} icon={TriangleAlert} tone={data.kpis.lowStockProducts > 0 ? "warning" : "success"} premium />
          </button>
          <StatCard label={t("dashboard.inventoryValue")} value={<AnimatedNumber value={data.kpis.inventoryValue} formatter={formatCurrency} />} hint={t("dashboard.inventoryValueHint")} icon={Coins} tone="primary" monetaryValue premium />
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

      <section className="nx-hero-strip">
        <div className="nx-hero-icon"><Activity className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Bienvenido a Nexora Smart Operations</p>
          <p className="mt-1 text-xs opacity-80">Consulta tus indicadores y accede a las operaciones de tu bodega desde un solo lugar.</p>
        </div>
        <Link to="/seriales" className="nx-hero-link">Consultar seriales <ArrowRight className="h-4 w-4" /></Link>
      </section>

      </section>

      {/* 2 · Movimiento y estado de operaciones: el período también controla exportaciones. */}
      <section className="nx-dashboard-block nx-dashboard-block--movement space-y-4" aria-label="Movimiento de inventario">
      <div className="flex flex-wrap items-end gap-3 nx-dashboard-report-filters rounded-xl border bg-card p-4">
        <div><label htmlFor="reporte-desde" className="block text-xs text-muted-foreground">Reporte desde</label><input id="reporte-desde" type="date" value={reporteDesde} max={reporteHasta} onChange={(e) => { setReporteDesde(e.target.value); setMovementPreset("custom"); }} className="mt-1 rounded-md border bg-background px-3 py-2 text-sm" /></div>
        <div><label htmlFor="reporte-hasta" className="block text-xs text-muted-foreground">Hasta</label><input id="reporte-hasta" type="date" value={reporteHasta} min={reporteDesde} onChange={(e) => { setReporteHasta(e.target.value); setMovementPreset("custom"); }} className="mt-1 rounded-md border bg-background px-3 py-2 text-sm" /></div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={reporteDesde > reporteHasta} onClick={exportarReporteOperativoExcel}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />Exportar a Excel (.xlsx)
          </Button>
          <Button type="button" variant="outline" disabled={reporteDesde > reporteHasta} onClick={exportarReporteOperativo}>
            <Download className="mr-2 h-4 w-4" />Exportar CSV
          </Button>
        </div>
      </div>

      <div className="nx-dashboard-analytics">
        <section className="nx-analytics-card" aria-labelledby="inventory-movement-heading">
          <div className="nx-analytics-header">
            <div className="nx-analytics-heading">
              <span className="nx-analytics-icon" aria-hidden="true"><Boxes className="h-5 w-5" /></span>
              <div>
                <h2 id="inventory-movement-heading">Movimiento de inventario</h2>
                <p>Entradas y salidas en el período seleccionado.</p>
              </div>
            </div>
            <div className="nx-analytics-controls">
              <span className="nx-analytics-legend"><span className="nx-analytics-dot bg-cyan-500" /> Entradas</span>
              <span className="nx-analytics-legend"><span className="nx-analytics-dot bg-violet-500" /> Salidas</span>
              <select className="nx-analytics-range" value={movementPreset}
                aria-label="Período del gráfico de inventario"
                onChange={(event) => changeMovementPreset(event.target.value as typeof movementPreset)}>
                <option value="month">Este mes</option>
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
                <option value="90d">Últimos 90 días</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>
          </div>
          <div className="nx-analytics-chart" role="img" aria-label="Gráfica de entradas y salidas de inventario">
            <ResponsiveContainer width="100%" height="100%" debounce={150}>
              <AreaChart data={movementChartData} margin={{ top: 8, right: 14, left: -13, bottom: 3 }}>
                <defs>
                  <linearGradient id="movementEntriesPremiumFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#05b9d5" stopOpacity={0.20} />
                    <stop offset="95%" stopColor="#05b9d5" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 5" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" interval={Math.max(0, Math.ceil(movementChartData.length / 8) - 1)}
                  tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} width={46} tickLine={false} axisLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))", fontSize: 12 }}
                  labelStyle={{ fontWeight: 700, color: "hsl(var(--foreground))" }}
                  formatter={(value, name) => [formatNumber(Number(value)), String(name)]}
                />
                <Area type="monotone" dataKey="entradas" name="Entradas" stroke="#05b9d5"
                  strokeWidth={2.6} fill="url(#movementEntriesPremiumFill)"
                  activeDot={{ r: 4, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="salidas" name="Salidas" stroke="#8655fa"
                  strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: "#8655fa", strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {movementChartData.every((day) => day.entradas === 0 && day.salidas === 0 && day.devoluciones === 0) ? (
            <p className="mt-2 text-center text-xs text-muted-foreground">Todavía no hay movimientos registrados en este período.</p>
          ) : null}
        </section>

        <section className="nx-analytics-card" aria-labelledby="operations-summary-heading">
          <div className="nx-analytics-header">
            <div className="nx-analytics-heading">
              <span className="nx-analytics-icon" aria-hidden="true"><BarChart3 className="h-5 w-5" /></span>
              <div>
                <h2 id="operations-summary-heading">Estado de operaciones</h2>
                <p>Indicadores actuales de la bodega.</p>
              </div>
            </div>
          </div>
          <div className="nx-operations-chart-layout">
            <div className="nx-operations-donut" role="img" aria-label="Gráfica de estado de operaciones">
              <ResponsiveContainer width="100%" height="100%" debounce={150}>
                <PieChart>
                  <Pie data={operationalChartData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius="66%" outerRadius="87%" paddingAngle={2} stroke="none">
                    {operationalChartData.map((item) => <Cell key={item.name} fill={item.color} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [formatNumber(Number(value)), String(name)]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="nx-operations-chart-center">
                <strong>Resumen</strong>
                <span>operativo</span>
              </div>
            </div>
            <div className="nx-operations-legend">
              {operationalChartData.map((item) => (
                <div className="nx-operations-legend__row" key={item.name}>
                  <span className="nx-analytics-dot" style={{ backgroundColor: item.color }} />
                  <span title={item.name}>{item.name}</span>
                  <strong className="tabular-nums">{formatNumber(item.value)}</strong>
                </div>
              ))}
            </div>
          </div>
          {operationalChartTotal === 0 ? <p className="text-center text-xs text-muted-foreground">Sin incidencias registradas.</p> : null}
        </section>
      </div>

      </section>

      {/* 3 · Rendimiento: clasificaciones y últimas unidades, sin perder acciones. */}
      <section className="nx-dashboard-block nx-dashboard-block--performance space-y-4" aria-label="Rendimiento de inventario">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Rendimiento de inventario</h2>
          <p className="text-sm text-muted-foreground">Productos y clientes con mayor movimiento.</p>
        </div>
      </div>
      <div className="nx-ranking-grid grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="premium-surface nx-ranking-card relative min-w-0 overflow-hidden p-4 transition-all duration-200 hover:shadow-elegant sm:p-5">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative mb-4 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="rounded-xl bg-primary/12 p-2 text-primary ring-1 ring-primary/10">
                <TrendingUp className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold tracking-tight">{t("dashboard.topProductsTitle")}</h3>
                <p className="mt-1 text-xs leading-4 text-muted-foreground">{t("dashboard.topProductsSubtitle")}</p>
              </div>
            </div>
            <Link
              to="/inventario"
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/15 bg-background/70 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              {t("common.viewAll")}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="relative">
            {data.topProducts.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                {t("dashboard.noSalesRanking")}
              </p>
            ) : (
              <RankChart
                data={productsChart}
                selectedSummaryLabel="Unidades vendidas de esta referencia"
                summaryLabel={t("dashboard.unitsTotal", { count: productsChart.reduce((total, row) => total + row.value, 0) })}
                formatValue={(value) => formatNumber(value)}
              />
            )}
          </div>
        </section>

        <section className="premium-surface nx-ranking-card relative min-w-0 overflow-hidden p-4 transition-all duration-200 hover:shadow-elegant sm:p-5">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-info/10 blur-3xl" />
          <div className="relative mb-4 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="rounded-xl bg-info/15 p-2 text-info ring-1 ring-info/10">
                <Users className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold tracking-tight">{t("dashboard.topCustomersTitle")}</h3>
                <p className="mt-1 text-xs leading-4 text-muted-foreground">
                  {clientesPorMonto
                    ? t("dashboard.topCustomersSubtitle")
                    : t("dashboard.topCustomersSubtitleUnits")}
                </p>
              </div>
            </div>
            <Link
              to="/clientes"
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-info/20 bg-background/70 px-3 py-1.5 text-xs font-medium text-info transition-colors hover:bg-info/10"
            >
              {t("common.viewAll")}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="relative">
            {data.topCustomers.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                {t("dashboard.noSalesRanking")}
              </p>
            ) : (
              <RankChart
                data={customersChart}
                selectedSummaryLabel={clientesPorMonto ? "Compras acumuladas de este cliente" : "Unidades compradas por este cliente"}
                summaryLabel={
                  clientesPorMonto
                    ? "Valor acumulado de los clientes destacados"
                    : t("dashboard.unitsTotal", { count: customersChart.reduce((total, row) => total + row.value, 0) })
                }
                formatValue={(value) =>
                  clientesPorMonto ? formatCurrency(value) : formatNumber(value)
                }
              />
            )}
          </div>
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

      </section>

      {/* 4 · Seguimiento de garantías con alertas y casos pendientes. */}
      <section className="nx-dashboard-block nx-dashboard-block--warranties space-y-4" aria-label="Prioridades de garantías">
      <section className="nx-warranty-section space-y-4" aria-labelledby="warranty-priorities-heading">
        <div className="nx-warranty-section__heading">
          <div className="nx-warranty-section__title">
            <span className="nx-warranty-section__accent" aria-hidden="true" />
            <div>
              <h2 id="warranty-priorities-heading">Prioridades de garantías</h2>
              <p>Casos que requieren seguimiento, ordenados por tiempo sin movimiento.</p>
            </div>
          </div>
          <Link to="/garantias" className="nx-manage-warranties">
            Gestionar garantías <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { title: "Críticas", count: prioridadesGarantia.criticas.length, description: "15 días o más sin movimiento", tone: "critical", Icon: TriangleAlert },
            { title: "Estancadas", count: prioridadesGarantia.estancadas.length, description: "De 7 a 14 días sin movimiento", tone: "stalled", Icon: Clock3 },
            { title: "Pendientes de entrega", count: prioridadesGarantia.listas.length, description: "Reenvío pendiente", tone: "pending", Icon: Truck },
            { title: "En servicio técnico", count: prioridadesGarantia.tecnico.length, description: "Equipos con el técnico", tone: "service", Icon: Wrench },
          ].map(({ title, count, description, tone, Icon }) => (
            <div key={title} className={`nx-warranty-kpi nx-warranty-kpi--${tone}`}>
              <span className="nx-warranty-kpi__icon" aria-hidden="true"><Icon className="h-6 w-6" /></span>
              <div className="nx-warranty-kpi__text">
                <h3 className="nx-warranty-kpi__title">{title}</h3>
                <p className="nx-warranty-kpi__value tabular-nums">{count}</p>
                <p className="nx-warranty-kpi__description">{description}</p>
              </div>
            </div>
          ))}
        </div>
        {data.openWarranties.length === 0 ? (
          <div className="nx-warranty-empty" role="status">
            <span className="nx-warranty-empty__icon" aria-hidden="true"><Inbox className="h-4 w-4" /></span>
            No hay garantías abiertas que requieran seguimiento.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[20px] border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/20 px-5 py-4">
              <h3 className="text-sm font-semibold">Casos para revisar</h3>
              <span className="text-xs text-muted-foreground">Hasta 6 casos con mayor antigüedad</span>
            </div>
            <div className="divide-y">
              {data.openWarranties.slice(0, 6).map((view) => {
                const days = diasSinMovimiento(view);
                return (
                  <Link key={view.warranty.id} to={`/garantias/${view.warranty.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{view.warranty.code}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {view.product?.name ?? view.warranty.referenciaManual ?? "Referencia no registrada"} · {view.unit?.serial ?? view.warranty.imeiManual ?? "Sin serial"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <WarrantyStatusBadge status={view.warranty.status} />
                      <span className={cn("rounded-full px-2 py-1 text-xs font-semibold tabular-nums",
                        days >= DIAS_GARANTIA_CRITICA ? "bg-destructive/10 text-destructive" :
                        days >= DIAS_GARANTIA_ESTANCADA ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground")}>
                        {days} d sin movimiento
                      </span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
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

      </section>

      {/* El diálogo conserva los mismos controles; fuera del flujo visual de las secciones. */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-5xl gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 pb-4 pt-5 pr-12 sm:px-6 sm:pt-6">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-lg bg-amber-100 p-2 text-amber-700"><TriangleAlert className="h-5 w-5" /></span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{data.kpis.lowStockProducts} referencias con alerta</span>
            </div>
            <DialogTitle>Productos con stock bajo</DialogTitle>
            <DialogDescription>Consulta por categoría y condición. Cada fila muestra las unidades disponibles y el mínimo correspondiente.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4 sm:px-6">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input aria-label="Buscar referencia o SKU" placeholder="Buscar referencia o SKU..." value={stockBusqueda} onChange={(event) => setStockBusqueda(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
            </div>
            <select aria-label="Filtrar categoría" value={stockCategoria} onChange={(event) => setStockCategoria(event.target.value)} className="h-10 min-w-[150px] rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
              <option value="todos">Todas las categorías</option>
              {categoriasStockBajo.map((categoria) => <option key={categoria} value={categoria}>{tiposProducto.get(categoria) ?? (categoria === "otros" ? "Otros" : categoria)}</option>)}
            </select>
            <span className="text-xs text-muted-foreground">{filasStockVisibles.length} resultados</span>
          </div>
          <div className="max-h-[54dvh] overflow-auto -mr-5 px-5 py-4 pr-5 sm:-mr-6 sm:px-6 sm:pr-6">
            {filasStockVisibles.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-10 text-center">
                <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
                <p className="font-medium">{filasStockBajo.length ? "No hay coincidencias" : "No hay productos con stock bajo"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{filasStockBajo.length ? "Prueba con otra referencia o categoría." : "El inventario no presenta alertas de stock."}</p>
                {filasStockBajo.length > 0 ? <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { setStockBusqueda(""); setStockCategoria("todos"); }}>Limpiar filtros</Button> : null}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-muted/90 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Referencia</th>
                      <th className="px-4 py-3 font-semibold">Categoría</th>
                      <th className="px-4 py-3 font-semibold">Condición</th>
                      <th className="px-4 py-3 text-center font-semibold">Disponible</th>
                      <th className="px-4 py-3 text-center font-semibold">Mínimo</th>
                      <th className="px-4 py-3 text-center font-semibold">Faltan</th>
                      <th className="px-4 py-3 text-right font-semibold">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filasStockVisibles.map(({ row, disponible, condicion, minimo }) => (
                      <tr key={`${row.product.id}-${condicion}`} className="transition-colors hover:bg-muted/40">
                        <td className="max-w-[250px] px-4 py-3">
                          <p className="truncate font-medium" title={row.product.name}>{row.product.name}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.product.sku}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{tiposProducto.get(row.product.categoria || "") ?? row.product.categoria ?? "Otros"}</td>
                        <td className="px-4 py-3">{condicion}</td>
                        <td className="px-4 py-3 text-center"><span className={cn("inline-flex min-w-9 justify-center rounded-full px-2 py-1 text-xs font-semibold", disponible === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>{disponible}</span></td>
                        <td className="px-4 py-3 text-center tabular-nums">{minimo}</td>
                        <td className="px-4 py-3 text-center font-semibold tabular-nums">{Math.max(0, minimo - disponible)}</td>
                        <td className="px-4 py-3 text-right"><Link to={`/inventario/${row.product.id}`} onClick={() => setStockDialogOpen(false)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Ver <ArrowRight className="h-3.5 w-3.5" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 sm:px-6">
            <Button type="button" onClick={exportarStockFiltrado} disabled={filasStockVisibles.length === 0} className="gap-2">
              <Download className="h-4 w-4" />
              Exportar filtrados ({filasStockVisibles.length})
            </Button>
            <Button variant="outline" asChild><Link to="/inventario" onClick={() => setStockDialogOpen(false)}>Ver inventario completo <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Panel;