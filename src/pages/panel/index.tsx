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
  Download,
  FileSpreadsheet,
  PackagePlus,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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
import { usePermissions } from "@/hooks/use-permissions";
import { useStore } from "@/hooks/use-store";
import { formatCurrency, formatNumber } from "@/lib/format";
import { crearCsv } from "@/lib/csv";
import { exportExcel } from "@/lib/export";
import { buildOperationalReportSheets } from "@/lib/dashboard-report";
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
  const [reporteDesde, setReporteDesde] = useState(() => new Date().toISOString().slice(0, 7) + "-01");
  const [reporteHasta, setReporteHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const dentroPeriodoReporte = (fecha: string) => (!reporteDesde || fecha.slice(0, 10) >= reporteDesde) &&
    (!reporteHasta || fecha.slice(0, 10) <= reporteHasta);

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

  // Movimiento diario en el rango elegido. Para periodos largos agrupamos por semana
  // para conservar la lectura de la curva sin llenar el eje de etiquetas.
  const movementChartData = useMemo(() => {
    const from = new Date(`${reporteDesde || new Date().toISOString().slice(0, 10)}T12:00:00`);
    const to = new Date(`${reporteHasta || new Date().toISOString().slice(0, 10)}T12:00:00`);
    const daysCount = Math.max(1, Math.min(366, Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1));
    const weekly = daysCount > 31;
    const buckets = new Map<string, { key: string; label: string; entradas: number; salidas: number; devoluciones: number }>();
    for (let index = 0; index < daysCount; index += 1) {
      const date = new Date(from);
      date.setDate(date.getDate() + index);
      if (weekly) date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      const key = date.toISOString().slice(0, 10);
      if (buckets.has(key)) continue;
      buckets.set(key, {
        key,
        label: weekly
          ? new Intl.DateTimeFormat("es", { day: "numeric", month: "short" }).format(date).replace(/\.$/, "")
          : new Intl.DateTimeFormat("es", { day: "numeric", month: "short" }).format(date).replace(/\.$/, ""),
        entradas: 0,
        salidas: 0,
        devoluciones: 0,
      });
    }
    for (const movement of db.movements) {
      const movementDate = movement.createdAt.slice(0, 10);
      if (movementDate < (reporteDesde || "") || movementDate > (reporteHasta || "9999-12-31")) continue;
      const date = new Date(`${movementDate}T12:00:00`);
      if (weekly) date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      const bucket = buckets.get(date.toISOString().slice(0, 10));
      if (!bucket) continue;
      if (movement.type === "entrada") bucket.entradas += movement.quantity;
      else if (movement.type === "salida") bucket.salidas += movement.quantity;
      else if (movement.type === "devolucion") bucket.devoluciones += movement.quantity;
    }
    return [...buckets.values()];
  }, [db.movements, reporteDesde, reporteHasta]);
  const operationalChartData = [
    { name: "Pedidos abiertos", value: data.kpis.openOrders, color: "#3b82f6" },
    { name: "Garantías abiertas", value: data.kpis.openWarranties, color: "#8b5cf6" },
    { name: "Stock bajo", value: data.kpis.lowStockProducts, color: "#f59e0b" },
    { name: "Recibidas este mes", value: data.kpis.receivedThisMonth, color: "#06b6d4" },
  ];
  const operationalChartTotal = operationalChartData.reduce((total, item) => total + item.value, 0);

  return (
    <div className="space-y-8 stagger">
      <div className="nx-dashboard-heading">
        <div>
          <div className="nx-eyebrow"><Sparkles className="h-3.5 w-3.5" /> CENTRO DE OPERACIONES</div>
          <PageHeader title="Panel principal" description="Resumen general de tu inventario y operaciones." />
        </div>
        <span className="nx-live-pill"><span className="nx-live-dot" /> Información de tu operación</span>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div><label htmlFor="reporte-desde" className="block text-xs text-muted-foreground">Reporte desde</label><input id="reporte-desde" type="date" value={reporteDesde} max={reporteHasta} onChange={(e) => setReporteDesde(e.target.value)} className="mt-1 rounded-md border bg-background px-3 py-2 text-sm" /></div>
        <div><label htmlFor="reporte-hasta" className="block text-xs text-muted-foreground">Hasta</label><input id="reporte-hasta" type="date" value={reporteHasta} min={reporteDesde} onChange={(e) => setReporteHasta(e.target.value)} className="mt-1 rounded-md border bg-background px-3 py-2 text-sm" /></div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={reporteDesde > reporteHasta} onClick={exportarReporteOperativoExcel}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />Exportar a Excel (.xlsx)
          </Button>
          <Button type="button" variant="outline" disabled={reporteDesde > reporteHasta} onClick={exportarReporteOperativo}>
            <Download className="mr-2 h-4 w-4" />Exportar CSV
          </Button>
        </div>
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
          <StatCard label={t("dashboard.receivedThisMonth")} value={<AnimatedNumber value={data.kpis.receivedThisMonth} formatter={formatNumber} />} hint={`${t("dashboard.receivedHint")} · ${t("dashboard.comparisonPeriod")}`} icon={PackagePlus} tone="info" trend={receivedTrend.label} trendTone={receivedTrend.tone} />
          <button
            type="button"
            onClick={() => setStockDialogOpen(true)}
            aria-label="Ver detalle de productos con stock bajo"
            className="block w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 [&_.nx-stat-card]:h-full [&_.nx-stat-card]:cursor-pointer [&_.nx-stat-card]:hover:border-primary/40"
          >
            <StatCard label={t("dashboard.lowStock")} value={<AnimatedNumber value={data.kpis.lowStockProducts} formatter={formatNumber} />} hint={t("dashboard.lowStockHint")} icon={TriangleAlert} tone={data.kpis.lowStockProducts > 0 ? "warning" : "success"} />
          </button>
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

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Prioridades de garantías</h2>
            <p className="text-sm text-muted-foreground">Casos que requieren seguimiento, ordenados por tiempo sin movimiento.</p>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/garantias">Gestionar garantías <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { titulo: "Críticas", cantidad: prioridadesGarantia.criticas.length, nota: `15 días o más sin movimiento`, clase: "text-destructive" },
            { titulo: "Estancadas", cantidad: prioridadesGarantia.estancadas.length, nota: "De 7 a 14 días sin movimiento", clase: "text-amber-600" },
            { titulo: "Pendientes de entrega", cantidad: prioridadesGarantia.listas.length, nota: "Reenvío pendiente", clase: "text-primary" },
            { titulo: "En servicio técnico", cantidad: prioridadesGarantia.tecnico.length, nota: "Equipos con el técnico", clase: "text-foreground" },
          ].map((item) => (
            <div key={item.titulo} className="rounded-xl border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground">{item.titulo}</p>
              <p className={cn("mt-2 text-3xl font-bold tabular-nums", item.clase)}>{item.cantidad}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.nota}</p>
            </div>
          ))}
        </div>
        {data.openWarranties.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">No hay garantías abiertas que requieran seguimiento.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
              <h3 className="text-sm font-semibold">Casos para revisar</h3>
              <span className="text-xs text-muted-foreground">Hasta 6 casos con mayor antigüedad</span>
            </div>
            <div className="divide-y">
              {data.openWarranties.slice(0, 6).map((view) => {
                const dias = diasSinMovimiento(view);
                return (
                  <Link key={view.warranty.id} to={`/garantias/${view.warranty.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{view.warranty.code}</p>
                      <p className="truncate text-xs text-muted-foreground">{view.product?.name ?? view.warranty.referenciaManual ?? "Referencia no registrada"} · {view.unit?.serial ?? view.warranty.imeiManual ?? "Sin serial"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <WarrantyStatusBadge status={view.warranty.status} />
                      <span className={cn("rounded-full px-2 py-1 text-xs font-semibold tabular-nums", dias >= DIAS_GARANTIA_CRITICA ? "bg-destructive/10 text-destructive" : dias >= DIAS_GARANTIA_ESTANCADA ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground")}>{dias} d sin movimiento</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <div className="grid min-w-0 gap-3 xl:grid-cols-[1.45fr_1fr]">
        <section className="premium-surface nx-ranking-card min-w-0 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Movimiento de inventario</h2>
              <p className="mt-1 text-xs text-muted-foreground">Entradas y salidas en el periodo seleccionado.</p>
            </div>
            <div className="flex shrink-0 items-center gap-3 pt-0.5 text-[11px]">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-cyan-500" />Entradas</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500" />Salidas</span>
            </div>
          </div>
          <div className="h-[205px] w-full">
            <ResponsiveContainer width="100%" height="100%" debounce={150}>
              <AreaChart data={movementChartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="movementEntriesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.015} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" interval={Math.max(0, Math.ceil(movementChartData.length / 10) - 1)} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis hide allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", fontSize: 12 }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  formatter={(value, name) => [formatNumber(Number(value)), String(name)]}
                />
                <Area type="monotone" dataKey="entradas" name="Entradas" stroke="#06b6d4" strokeWidth={2} fill="url(#movementEntriesFill)" activeDot={{ r: 4, strokeWidth: 0 }} />
                <Line type="monotone" dataKey="salidas" name="Salidas" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#8b5cf6", strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {movementChartData.every((day) => day.entradas === 0 && day.salidas === 0 && day.devoluciones === 0) ? (
            <p className="mt-1 text-center text-xs text-muted-foreground">Todavía no hay movimientos registrados en este periodo.</p>
          ) : null}
        </section>

        <section className="premium-surface nx-ranking-card min-w-0 p-4">
          <div className="mb-1">
            <h2 className="text-sm font-semibold">Estado de operaciones</h2>
            <p className="mt-1 text-xs text-muted-foreground">Indicadores actuales de la bodega.</p>
          </div>
          <div className="grid min-h-[205px] grid-cols-[minmax(130px,0.9fr)_minmax(0,1.1fr)] items-center gap-1 sm:gap-3">
            <div className="relative h-[190px] min-w-0">
              <ResponsiveContainer width="100%" height="100%" debounce={150}>
                <PieChart>
                  <Pie data={operationalChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="64%" outerRadius="84%" paddingAngle={2} stroke="none">
                    {operationalChartData.map((item) => <Cell key={item.name} fill={item.color} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [formatNumber(Number(value)), String(name)]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xs font-semibold">Resumen</span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">operativo</span>
              </div>
            </div>
            <div className="min-w-0 space-y-3">
              {operationalChartData.map((item) => (
                <div key={item.name} className="flex min-w-0 items-center gap-2 text-[11px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="font-tabular shrink-0 font-semibold">{formatNumber(item.value)}</span>
                </div>
              ))}
            </div>
          </div>
          {operationalChartTotal === 0 ? <p className="text-center text-[10px] text-muted-foreground">Sin incidencias registradas.</p> : null}
        </section>
      </div>

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