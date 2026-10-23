import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  TriangleAlert,
  FileSpreadsheet,
  FileText,
  BarChart3,
  History,
  PackageSearch,
  PackageCheck,
  Plus,
  Printer,
  Send,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SerialScanInput } from "@/components/shared/serial-scan-input";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductThumbnail } from "@/components/shared/product-thumbnail";
import { Badge, PendingImeiBadge, WarrantyStatusBadge } from "@/components/shared/status-badge";
import { WarrantyOriginBadge } from "@/components/shared/warranty-origin-badge";
import { Button } from "@/components/ui/button";
import { OptionSelect } from "@/components/shared/option-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/hooks/use-app";
import { usePermissions } from "@/hooks/use-permissions";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import {
  exportCompanyName,
  exportExcel,
  exportSubtitle,
  exportSubtitleEquipos,
  exportWarrantyPdf,
  type WarrantyCard,
} from "@/lib/export";
import { esCodigoInterno, generarCodigoInterno } from "@/lib/imei";
import { imprimirEtiquetas } from "@/lib/print-labels";
import {
  contarGarantiasPorEstado,
  createWarrantyByImei,
  createWarrantyFallaInventario,
  createWarrantiesByImeis,
  createWarrantyPrevia,
  createWarrantiesPrevias,
  devolverGarantiasABodega,
  enviarATecnico,
  isOpenWarranty,
  type WarrantyItemResult,
} from "@/lib/actions/warranties";
import {
  buscarSerialPrevio,
  getUnitOrigen,
  rutaDeRecepcion,
  DIAS_GARANTIA_CRITICA,
  DIAS_GARANTIA_ESTANCADA,
  diasSinMovimiento,
  findUnitBySerial,
  getWarrantyViews,
  type WarrantyView,
} from "@/lib/selectors";
import { formatDate, formatDateTime, todayIso } from "@/lib/format";
import { crearCsv } from "@/lib/csv";
import { getWarrantyOrigin, type WarrantyOrigin } from "@/lib/warranty-origin";
import {
  FILTRO_REENVIO_VACIO,
  type FiltroReenvio,
  filtrarReenvio,
  hayFiltroReenvio,
} from "@/lib/warranty-reenvio";
import { onEnter } from "@/lib/keys";
import { garantiasNuevasDeUsuario } from "@/lib/warranty-lotes";
import { TABS_GARANTIAS as TABS, tabDesdeParametro, type TabGarantias } from "@/lib/warranty-tabs";
import { CodeLink } from "@/components/shared/code-link";
import { ClienteTecnologiaSelect } from "@/components/shared/cliente-tecnologia-select";
import { FiltrosReenvio } from "./filtros-reenvio";
import { DeshacerEstadoButton } from "./deshacer-estado";
import { SEARCH_INPUT_PROPS } from "@/lib/search-input";
import { cn } from "@/lib/utils";
import type { Unit, WarrantyStatus } from "@/lib/types";
import {
  DevolverDialog,
  DiagnosticoDialog,
  EntregarDialog,
  TecnicosDialog,
} from "./modals";
import { SelectorDocumentoGarantia } from "./warranty-documents";
import { subirSiHayArchivo } from "./subir-documento-garantia";

type Tab = TabGarantias;

/** Lotes desplegados: se recuerdan al ir al detalle de una garantía y volver. */
const CLAVE_LOTES_ABIERTOS = "garantias:lotes-abiertos";

const leerLotesAbiertos = (): Set<string> => {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(CLAVE_LOTES_ABIERTOS) ?? "[]") as unknown;
    return new Set(Array.isArray(guardado) ? guardado.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
};

/** Estados que resume cada pestaña, para el contador de casos. */
const ESTADOS_POR_TAB: Partial<Record<Tab, WarrantyStatus[]>> = {
  recibidos: ["recibido"],
  servicio: ["en_servicio_tecnico"],
  reenvio: ["reenvio_pendiente"],
  historial: ["entregado", "devuelto"],
};

/** Mensaje visible cuando un serial escaneado no se puede recibir (antes fallaba en silencio). */
interface Aviso {
  tone: "error" | "warning" | "info";
  text: string;
  /** Si el serial es de una venta previa, permite saltar al modo "garantía previa". */
  previaSerial?: string;
}

type EvaluacionSerial = { tipo: "ok"; unit: Unit } | { tipo: "aviso"; aviso: Aviso };

interface LoteItem {
  imei: string;
  producto: string;
  folio: string;
  cliente: string;
  obs: string;
}

/** Una fila del lote de garantías previas: igual que el formulario de "una por una", pero en lista. */
interface PreviaLoteItem {
  imei: string;
  referencia: string;
  cliente: string;
  fecha: string;
  motivo: string;
}

const warrantyInfo = (view: WarrantyView) => {
  const serial = view.warranty.unitId ? view.unit?.serial : view.warranty.imeiManual;
  const producto = view.product?.name ?? view.warranty.referenciaManual ?? "—";
  const cliente = view.customer?.name ?? view.warranty.clienteManual ?? "—";
  return { serial, producto, cliente };
};

/** Lote de garantías recibidas: comparten pedido (o, sin pedido, día/cliente de ingreso). */
interface LoteRecibido {
  key: string;
  title: string;
  subtitle?: string;
  origin: WarrantyOrigin;
  views: WarrantyView[];
}

/** Orden fijo de los lotes: primero falla de inventario, luego garantía normal, luego previa. */
const ORDEN_ORIGEN: Record<WarrantyOrigin, number> = {
  falla_inventario: 0,
  normal: 1,
  previa: 2,
};

/** Hub de garantías: recepción (por IMEI, pedido, previa, falla) y bandeja. */
/**
 * Un lote de garantías (Recibidos y, ahora, En servicio): encabezado con título/origen/cantidad
 * que se abre y cierra, y las tarjetas de sus casos cuando está abierto. `acciones` es lo
 * único que cambia entre pestañas (en Recibidos, seleccionar todos; en Servicio, nada).
 */
const LoteGarantias = ({
  lote,
  cerrado,
  onToggle,
  acciones,
  renderCard,
  t,
  mostrarOrigen = true,
}: {
  lote: LoteRecibido;
  cerrado: boolean;
  onToggle: () => void;
  acciones?: React.ReactNode;
  renderCard: (view: WarrantyView) => React.ReactNode;
  t: (key: string, params?: Record<string, unknown>) => string;
  mostrarOrigen?: boolean;
}) => (
  <section className="overflow-hidden rounded-lg border">
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2">
      <button
        type="button"
        aria-expanded={!cerrado}
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform duration-200", cerrado && "-rotate-90")}
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{lote.title}</span>
          {lote.subtitle ? (
            <span className="block truncate text-xs text-muted-foreground">{lote.subtitle}</span>
          ) : null}
        </span>
      </button>
      {mostrarOrigen ? <WarrantyOriginBadge origin={lote.origin} /> : null}
      <Badge label={t("export.unitsCount", { count: lote.views.length })} withDot={false} />
      {acciones}
    </div>
    {cerrado ? null : (
      // El contenedor "lote-expand" despliega el lote hacia abajo al abrirlo; al cerrar se
      // desmonta igual que antes (las pruebas y los lotes recordados dependen de eso).
      <div className="lote-expand">
        <div className="animate-fade-in grid gap-3 p-3 motion-reduce:animate-none lg:grid-cols-2">
          {lote.views.map(renderCard)}
        </div>
      </div>
    )}
  </section>
);

const Garantias = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  // Construir primero las vistas evita que los efectos de navegación por foco
  // cierren sobre una declaración todavía no inicializada en el render.
  const vistas = useMemo(() => getWarrantyViews(db), [db]);
  const { isAdmin } = usePermissions();

  // Clientes de tecnología (celulares o ambos) para el selector de garantía previa.
  const clientesTecnologia = db.customers
    .filter((c) => c.isActive && (c.categoriaMayorista ?? "ambos") !== "repuestos")
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));

  // Referencias del catálogo: sugerencias únicas para garantías previas y filtros.
  const referenciasInventario = useMemo(
    () => [...new Set(db.products.map((producto) => producto.name.trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "es")),
    [db.products],
  );

  // La pestaña activa vive en la dirección (?tab=recibidos): así, al ver una garantía y volver
  // (botón "Volver" o "atrás" del navegador), se regresa a la misma pestaña.
  const [params, setParams] = useSearchParams();
  const tab = tabDesdeParametro(params.get("tab"));
  const setTab = (siguiente: Tab) =>
    setParams(
      (previo) => {
        const next = new URLSearchParams(previo);
        if (siguiente === "recibir") next.delete("tab");
        else next.set("tab", siguiente);
        return next;
      },
      { replace: true },
    );
  const [modo, setModo] = useState<"imei" | "previa" | "falla">("imei");
  const [imeiMode, setImeiMode] = useState<"uno" | "lote">("uno");

  // Recepción por IMEI
  const [unidadEncontrada, setUnidadEncontrada] = useState<Unit | null>(null);
  const [unidadInfo, setUnidadInfo] = useState<{ folio?: string; cliente?: string }>({});
  const [motivoUno, setMotivoUno] = useState("");
  const [lote, setLote] = useState<LoteItem[]>([]);
  // Hoja de "relación" del proveedor (PDF o foto), si la eligieron antes de registrar.
  const [archivoUno, setArchivoUno] = useState<File | null>(null);
  const [archivoLote, setArchivoLote] = useState<File | null>(null);
  const [loteObs, setLoteObs] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // Previa
  const [previa, setPrevia] = useState({
    imei: "",
    referencia: "",
    cliente: "",
    fecha: "",
    motivo: "",
  });
  const [previaMode, setPreviaMode] = useState<"uno" | "lote">("uno");
  const [lotePrevias, setLotePrevias] = useState<PreviaLoteItem[]>([]);
  const [previaLoteDraft, setPreviaLoteDraft] = useState({
    imei: "",
    referencia: "",
    cliente: "",
    fecha: "",
    motivo: "",
  });
  const [archivoLotePrevias, setArchivoLotePrevias] = useState<File | null>(null);

  // Bandeja
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  // Lotes de "Recibidos" desplegados: todos empiezan cerrados; se abren al pulsarlos o cuando
  // entra una garantía nueva a ese lote.
  // Al entrar desde el menú empiezan todos cerrados; al volver de un detalle (la dirección trae
  // la pestaña) se recuperan los que estaban desplegados.
  const [lotesAbiertos, setLotesAbiertos] = useState<Set<string>>(() =>
    params.get("tab") ? leerLotesAbiertos() : new Set(),
  );
  useEffect(() => {
    try {
      sessionStorage.setItem(CLAVE_LOTES_ABIERTOS, JSON.stringify([...lotesAbiertos]));
    } catch {
      // Sin almacenamiento: solo se pierde el recuerdo al volver.
    }
  }, [lotesAbiertos]);
  // Filtro "solo estancadas" para las bandejas de casos abiertos
  const [soloEstancadas, setSoloEstancadas] = useState(false);

  // Filtro del historial (independiente de la búsqueda por IMEI)
  const [filtroHistorial, setFiltroHistorial] = useState("");
  const [referenciaHistorial, setReferenciaHistorial] = useState("");
  const [mostrarEstadisticas, setMostrarEstadisticas] = useState(false);
  const [estadisticaDesde, setEstadisticaDesde] = useState("");
  const [estadisticaHasta, setEstadisticaHasta] = useState("");
  const [estadisticaReferencia, setEstadisticaReferencia] = useState("");

  // Filtros de la pestaña Reenvío: lo que se ve es lo que se exporta.
  const [filtroReenvio, setFiltroReenvio] = useState<FiltroReenvio>(FILTRO_REENVIO_VACIO);

  // Buscar IMEI
  const [buscarResultado, setBuscarResultado] = useState<string | null>(null);

  /**
   * Agrupa los casos recibidos por lote: con pedido, el lote es el pedido. Sin pedido,
   * las fallas de inventario se agrupan por día de ingreso y las demás por cliente.
   */
  const infoLote = (view: WarrantyView) => {
    const origin = getWarrantyOrigin(view.warranty, view.order);
    const cliente = view.customer?.name ?? view.warranty.clienteManual;
    let key: string;
    let title: string;
    let subtitle: string | undefined;
    if (view.order) {
      key = `pedido:${view.order.id}`;
      title = `${t("export.pedido")} ${view.order.code}`;
      subtitle = cliente;
    } else if (origin === "falla_inventario") {
      const dia = formatDate(view.warranty.receivedAt);
      key = `falla:${dia}`;
      title = `${t("warranty.origin.falla_inventario")} · ${dia}`;
    } else {
      key = `${origin}:${view.warranty.customerId ?? view.warranty.clienteManual ?? "sin-datos"}`;
      title = origin === "previa" ? t("warranty.origin.previa") : t("warranty.lote.saleNoOrder");
      subtitle = cliente;
    }
    return { key, title, subtitle, origin };
  };

  /** En Historial agrupamos por cliente (todas sus garantías juntas) y separamos inventario propio. */
  const infoHistorial = (view: WarrantyView): Pick<LoteRecibido, "key" | "title" | "subtitle" | "origin"> => {
    const origin = getWarrantyOrigin(view.warranty, view.order);
    if (origin === "falla_inventario") {
      return {
        key: "historial:falla-inventario",
        title: t("warranty.history.inventoryGroup"),
        subtitle: t("warranty.history.inventorySubtitle"),
        origin,
      };
    }
    const cliente = (view.customer?.name ?? view.warranty.clienteManual ?? t("warranty.history.unknownCustomer")).trim();
    const claveCliente = cliente.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return {
      key: `historial:cliente:${claveCliente}`,
      title: cliente,
      subtitle: t("warranty.history.customerSubtitle"),
      origin: "normal",
    };
  };

  // Navegación desde Historial de Serial: abrir la bandeja, desplegar el lote
  // correspondiente y localizar visualmente la garantía (sin abrir su ficha).
  const focusId = params.get("focus");
  const focusView = focusId ? vistas.find((v) => v.warranty.id === focusId) : undefined;
  const focusViewId = focusView?.warranty.id;
  const focusLoteKey = focusView
    ? (tab === "historial" ? infoHistorial(focusView).key : infoLote(focusView).key)
    : undefined;
  useEffect(() => {
    if (!focusLoteKey) return;
    setSoloEstancadas(false);
    setFiltroHistorial("");
    setReferenciaHistorial("");
    setFiltroReenvio(FILTRO_REENVIO_VACIO);
    setLotesAbiertos((previous) => new Set([...previous, focusLoteKey]));
  }, [focusId, focusLoteKey]);

  useEffect(() => {
    if (!focusId || !focusViewId) return;
    const timer = window.setTimeout(() => {
      const card = document.getElementById(`garantia-operativa-${focusId}`);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [focusId, focusViewId, tab]);

  const casosHistorial = useMemo(
    () => vistas.filter((v) => v.warranty.status === "entregado" || v.warranty.status === "devuelto"),
    [vistas],
  );
  const referenciasHistorial = useMemo(
    () => [...new Set(casosHistorial.map((v) => (v.product?.name ?? v.warranty.referenciaManual ?? "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "es")),
    [casosHistorial],
  );
  const estadisticas = useMemo(() => {
    const casos = vistas.filter(({ warranty, product }) => {
      const fecha = warranty.receivedAt.slice(0, 10);
      return (!estadisticaDesde || fecha >= estadisticaDesde) &&
        (!estadisticaHasta || fecha <= estadisticaHasta) &&
        (!estadisticaReferencia || (product?.name ?? warranty.referenciaManual ?? "Sin referencia") === estadisticaReferencia);
    });
    const conteo = (valor: (typeof casos)[number]) => valor.product?.name ?? valor.warranty.referenciaManual ?? "Sin referencia";
    const referencias = new Map<string, number>();
    const motivos = new Map<string, number>();
    for (const caso of casos) {
      const nombre = conteo(caso);
      referencias.set(nombre, (referencias.get(nombre) ?? 0) + 1);
      const motivo = caso.warranty.reason.trim() || "Sin motivo registrado";
      motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1);
    }
    const ordenar = (mapa: Map<string, number>) => [...mapa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
    const cerradas = casos.filter(({ warranty }) => warranty.status === "entregado" || warranty.status === "devuelto");
    const duraciones = cerradas.map(({ warranty }) => {
      const inicio = Date.parse(warranty.receivedAt);
      const fin = Date.parse(warranty.resolvedAt ?? "");
      return Number.isFinite(inicio) && Number.isFinite(fin) && fin >= inicio ? (fin - inicio) / 86400000 : null;
    }).filter((dias): dias is number => dias !== null);
    return {
      total: casos.length,
      abiertas: casos.length - cerradas.length,
      cerradas: cerradas.length,
      reparadas: casos.filter(({ warranty }) => warranty.resolucion === "reparado").length,
      cambios: casos.filter(({ warranty }) => warranty.resolucion === "cambio").length,
      defectuosas: casos.filter(({ warranty }) => warranty.resolucion === "defectuoso").length,
      sinFalla: casos.filter(({ warranty }) => warranty.resolucion === "sin_falla").length,
      promedioDias: duraciones.length ? duraciones.reduce((total, dias) => total + dias, 0) / duraciones.length : null,
      referencias: ordenar(referencias),
      motivos: ordenar(motivos),
    };
  }, [vistas, estadisticaDesde, estadisticaHasta, estadisticaReferencia]);
  const referenciasEstadisticas = useMemo(() =>
    [...new Set(vistas.map(({ product, warranty }) => product?.name ?? warranty.referenciaManual ?? "Sin referencia"))].sort((a, b) => a.localeCompare(b, "es")),
    [vistas],
  );
  const exportarEstadisticas = () => {
    const lineas = [
      ["Indicador", "Valor"],
      ["Garantías registradas", estadisticas.total],
      ["Abiertas", estadisticas.abiertas],
      ["Cerradas", estadisticas.cerradas],
      ["Diagnóstico reparado", estadisticas.reparadas],
      ["Diagnóstico cambio", estadisticas.cambios],
      ["Diagnóstico defectuoso", estadisticas.defectuosas],
      ["Diagnóstico sin falla", estadisticas.sinFalla],
      ["Promedio días hasta resolución", estadisticas.promedioDias?.toFixed(1) ?? "Sin datos"],
      ["", ""],
      ["Referencia", "Garantías"],
      ...estadisticas.referencias,
      ["", ""],
      ["Motivo reportado", "Garantías"],
      ...estadisticas.motivos,
    ];
    const csv = crearCsv(lineas);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "nexora-estadisticas-garantias-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const badges = useMemo(
    () => new Map(contarGarantiasPorEstado(db).map((r) => [r.estado, r.cantidad])),
    [db],
  );
  const badgeDeTab = (opcion: Tab) =>
    (ESTADOS_POR_TAB[opcion] ?? []).reduce(
      (suma, estado) => suma + (badges.get(estado) ?? 0),
      0,
    );

  // Al registrar una garantía, se despliega el lote donde quedó. Las que ya existían al abrir
  // la pantalla no cuentan, ni las que registra otra persona.
  const { user } = useApp();
  const conocidasRef = useRef<Set<string> | null>(null);
  if (conocidasRef.current === null) {
    conocidasRef.current = new Set(db.warranties.map((garantia) => garantia.id));
  }
  useEffect(() => {
    const conocidas = conocidasRef.current;
    if (!conocidas) return;
    const nuevas = garantiasNuevasDeUsuario(conocidas, db.warranties, user?.id);
    db.warranties.forEach((garantia) => conocidas.add(garantia.id));
    if (nuevas.length === 0) return;
    const ids = new Set(nuevas.map((garantia) => garantia.id));
    const claves = vistas.filter((view) => ids.has(view.warranty.id)).map((view) => infoLote(view).key);
    if (claves.length > 0) setLotesAbiertos((previo) => new Set([...previo, ...claves]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.warranties]);

  // Casos abiertos con días sin movimiento; los que llevan más tiempo quietos van primero.
  const diasPorCaso = useMemo(
    () => new Map(vistas.filter((v) => v.open).map((v) => [v.warranty.id, diasSinMovimiento(v)])),
    [vistas],
  );
  const totalEstancadas = useMemo(
    () => [...diasPorCaso.values()].filter((dias) => dias >= DIAS_GARANTIA_ESTANCADA).length,
    [diasPorCaso],
  );

  const porTab = (estados: string[]) =>
    vistas
      .filter((v) => estados.includes(v.warranty.status))
      .filter(
        (v) =>
          !soloEstancadas || (diasPorCaso.get(v.warranty.id) ?? 0) >= DIAS_GARANTIA_ESTANCADA,
      )
      .sort((a, b) => (diasPorCaso.get(b.warranty.id) ?? -1) - (diasPorCaso.get(a.warranty.id) ?? -1));

  // ---------- Recepción por IMEI ----------
  const productoDeUnidad = (unit: Unit) =>
    db.products.find((p) => p.id === unit.productId)?.name ?? "—";

  const textoDeFallo = (resultado: WarrantyItemResult) =>
    t(
      resultado.motivo_error ?? "errors.unexpected",
      resultado.motivo_params ?? { serial: resultado.imei },
    );

  /**
   * Valida el serial según el flujo elegido:
   * - Venta registrada: debe estar vendido/entregado por garantía.
   * - Falla de inventario: debe estar disponible en bodega/local.
   * Si no existe en el sistema, solo el flujo de venta registrada puede continuar
   * como garantía previa.
   */
  const evaluarSerial = (serial: string, modoActual: "imei" | "falla"): EvaluacionSerial => {
    const valor = serial.trim();
    const unit = findUnitBySerial(db, valor);

    if (!unit) {
      if (modoActual === "imei") {
        const previo = buscarSerialPrevio(db, valor);
        return {
          tipo: "aviso",
          aviso: {
            tone: "warning",
            text: previo
              ? t("warranty.notice.notFoundPrevio", { serial: valor })
              : t("warranty.notice.notFound", { serial: valor }),
            // También se permite garantía previa cuando la venta anterior no se importó.
            previaSerial: previo?.serial ?? valor,
          },
        };
      }
      return {
        tipo: "aviso",
        aviso: {
          tone: "error",
          text: t("warranty.notice.notFound", { serial: valor }),
        },
      };
    }

    const abierta = db.warranties.find(
      (warranty) => warranty.unitId === unit.id && isOpenWarranty(warranty.status),
    );
    if (abierta) {
      return {
        tipo: "aviso",
        aviso: {
          tone: "warning",
          text: t("warranty.notice.open", { serial: unit.serial, code: abierta.code }),
        },
      };
    }

    const valido =
      modoActual === "falla"
        ? unit.status === "en_bodega" || unit.status === "en_local"
        : unit.status === "vendido" || unit.status === "entregado_garantia";
    if (!valido) {
      return {
        tipo: "aviso",
        aviso: {
          tone: "warning",
          text: t(
            modoActual === "falla" ? "warranty.notice.notInInventory" : "warranty.notice.notSold",
            { serial: unit.serial, status: t(`unitStatus.${unit.status}`) },
          ),
        },
      };
    }

    return { tipo: "ok", unit };
  };

  const infoDeVenta = (unit: Unit) => {
    const row = db.orderItemUnits.find((r) => r.unitId === unit.id);
    const item = row ? db.orderItems.find((i) => i.id === row.orderItemId) : undefined;
    const order = item ? db.orders.find((o) => o.id === item.orderId) : undefined;
    const customer = order ? db.customers.find((c) => c.id === order.customerId) : undefined;
    return { order, customer };
  };

  const modoDeSerial = modo === "falla" ? "falla" : "imei";

  const buscarUnidadParaGarantia = (serial: string) => {
    setUnidadEncontrada(null);
    setUnidadInfo({});
    setMotivoUno("");
    setAviso(null);
    const evaluacion = evaluarSerial(serial, modoDeSerial);
    if (evaluacion.tipo === "aviso") {
      setAviso(evaluacion.aviso);
      return;
    }
    const { order, customer } = infoDeVenta(evaluacion.unit);
    setUnidadEncontrada(evaluacion.unit);
    setUnidadInfo({ folio: order?.code, cliente: customer?.name });
  };

  const agregarLote = (serial: string) => {
    const valor = serial.trim();
    if (lote.some((item) => item.imei.toLowerCase() === valor.toLowerCase())) {
      setAviso({ tone: "info", text: t("warranty.notice.duplicate", { serial: valor }) });
      return;
    }
    const evaluacion = evaluarSerial(valor, modoDeSerial);
    if (evaluacion.tipo === "aviso") {
      setAviso(evaluacion.aviso);
      return;
    }
    setAviso(null);
    const unit = evaluacion.unit;
    const { order, customer } = infoDeVenta(unit);
    setLote((previous) => [
      ...previous,
      {
        imei: unit.serial,
        producto: productoDeUnidad(unit),
        folio: order?.code ?? "—",
        cliente: customer?.name ?? "—",
        obs: "",
      },
    ]);
  };

  /** Salta al modo "garantía previa" con el serial ya escrito. */
  const usarComoPrevia = (serial: string) => {
    setTab("recibir");
    setModo("previa");
    setPrevia((actual) => ({ ...actual, imei: serial }));
    setUnidadEncontrada(null);
    setLote([]);
    setAviso(null);
  };

  const recibirUno = async () => {
    if (!unidadEncontrada) return;
    const imei = unidadEncontrada.serial;
    if (modo === "falla") {
      const resultados = await runAction((db2, actor) =>
        createWarrantyFallaInventario(db2, actor, {
          items: [{ imei, observacion: motivoUno }],
        }),
      );
      if (!resultados) return;
      const fallo = resultados.find((resultado) => !resultado.ok);
      if (fallo) {
        toast.error(textoDeFallo(fallo));
        return;
      }
      toast.success(t("warranty.created"));
      const ids = resultados.filter((resultado) => resultado.ok && resultado.warrantyId).map((resultado) => resultado.warrantyId!);
      await subirSiHayArchivo(archivoUno, ids, t);
      setUnidadEncontrada(null);
      setMotivoUno("");
      setArchivoUno(null);
      return;
    }
    const result = await runAction(
      (db2, actor) =>
        createWarrantyByImei(db2, actor, {
          imei,
          observacion: motivoUno,
        }),
      { success: "warranty.created" },
    );
    if (result) {
      await subirSiHayArchivo(archivoUno, [result.id], t);
      setUnidadEncontrada(null);
      setMotivoUno("");
      setArchivoUno(null);
    }
  };

  const recibirLote = async () => {
    const items = lote.map((item) => ({ imei: item.imei, observacion: loteObs[item.imei] ?? item.obs }));
    const resultados = await runAction((db2, actor) =>
      modo === "falla"
        ? createWarrantyFallaInventario(db2, actor, { items })
        : createWarrantiesByImeis(db2, actor, { items }),
    );
    if (!resultados) return;

    // El lote puede recibirse a medias: se avisa de cada fallo y solo salen de la
    // lista los equipos que sí quedaron registrados.
    const fallidos = resultados.filter((resultado) => !resultado.ok);
    const recibidos = resultados.length - fallidos.length;
    if (recibidos > 0) {
      toast.success(`${t("warranty.batchReceived")} · ${t("warranty.lotSummary", { count: recibidos })}`);
    }
    // El documento adjunto (la hoja de "relación") se enlaza a TODAS las garantías que sí se
    // recibieron en este lote: es la misma hoja para todas.
    const idsRecibidos = resultados.filter((r) => r.ok && r.warrantyId).map((r) => r.warrantyId!);
    await subirSiHayArchivo(archivoLote, idsRecibidos, t);
    if (idsRecibidos.length > 0) setArchivoLote(null);
    const fallidosSet = new Set(fallidos.map((fallo) => fallo.imei));
    setLote((previous) => previous.filter((item) => fallidosSet.has(item.imei)));
    setAviso(
      fallidos.length > 0
        ? {
            tone: "error",
            text: [
              t("warranty.lotFailedTitle", { count: fallidos.length }),
              ...fallidos.map((fallo) =>
                t("warranty.lotFailed", { serial: fallo.imei, reason: textoDeFallo(fallo) }),
              ),
            ].join("\n"),
          }
        : null,
    );
  };

  /** Agrega una fila a la lista del lote de previas, sin guardar nada todavía. */
  const agregarLotePrevia = () => {
    const valor = previaLoteDraft.imei.trim();
    if (lotePrevias.some((item) => item.imei.toLowerCase() === valor.toLowerCase())) {
      setAviso({ tone: "info", text: t("warranty.notice.duplicate", { serial: valor }) });
      return;
    }
    setAviso(null);
    setLotePrevias((previous) => [
      ...previous,
      {
        imei: valor,
        referencia: previaLoteDraft.referencia.trim(),
        cliente: previaLoteDraft.cliente.trim(),
        fecha: previaLoteDraft.fecha,
        motivo: previaLoteDraft.motivo.trim(),
      },
    ]);
    setPreviaLoteDraft({ imei: "", referencia: "", cliente: "", fecha: "", motivo: "" });
  };

  const recibirLotePrevias = async () => {
    const items = lotePrevias.map((item) => ({
      imeiManual: item.imei,
      referenciaManual: item.referencia,
      clienteManual: item.cliente,
      fechaVentaManual: item.fecha || undefined,
      observacion: item.motivo,
    }));
    const resultados = await runAction((db2, actor) => createWarrantiesPrevias(db2, actor, { items }));
    if (!resultados) return;

    // Igual que el lote por IMEI: puede recibirse a medias, se avisa fila por fila y solo
    // salen de la lista las que sí quedaron registradas.
    const fallidos = resultados.filter((resultado) => !resultado.ok);
    const recibidos = resultados.length - fallidos.length;
    if (recibidos > 0) {
      toast.success(`${t("warranty.batchReceived")} · ${t("warranty.lotSummary", { count: recibidos })}`);
    }
    const idsRecibidos = resultados.filter((r) => r.ok && r.warrantyId).map((r) => r.warrantyId!);
    await subirSiHayArchivo(archivoLotePrevias, idsRecibidos, t);
    if (idsRecibidos.length > 0) setArchivoLotePrevias(null);
    const fallidosSet = new Set(fallidos.map((fallo) => fallo.imei));
    setLotePrevias((previous) => previous.filter((item) => fallidosSet.has(item.imei)));
    setAviso(
      fallidos.length > 0
        ? {
            tone: "error",
            text: [
              t("warranty.lotFailedTitle", { count: fallidos.length }),
              ...fallidos.map((fallo) =>
                t("warranty.lotFailed", { serial: fallo.imei, reason: textoDeFallo(fallo) }),
              ),
            ].join("\n"),
          }
        : null,
    );
  };

  const recibirPrevia = async () => {
    const result = await runAction(
      (db2, actor) =>
        createWarrantyPrevia(db2, actor, {
          imeiManual: previa.imei,
          referenciaManual: previa.referencia,
          clienteManual: previa.cliente,
          fechaVentaManual: previa.fecha || undefined,
          observacion: previa.motivo,
        }),
      { success: "warranty.created" },
    );
    if (result) {
      setPrevia({ imei: "", referencia: "", cliente: "", fecha: "", motivo: "" });
    }
  };

  // ---------- Bandeja ----------
  const enviarSeleccionados = async (tecnicoId: string) => {
    if (seleccionados.size === 0) return;
    const result = await runAction(
      (db2, actor) => enviarATecnico(db2, actor, { warrantyIds: [...seleccionados], tecnicoId }),
      { success: "warranty.sentToTecnico" },
    );
    if (result !== null) setSeleccionados(new Set());
  };

  const toggleSeleccion = (id: string) =>
    setSeleccionados((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleLoteAbierto = (key: string) =>
    setLotesAbiertos((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** Marca o desmarca de una vez todos los equipos de un lote. */
  const toggleSeleccionLote = (lote: LoteRecibido) =>
    setSeleccionados((previous) => {
      const next = new Set(previous);
      const ids = lote.views.map((view) => view.warranty.id);
      if (ids.every((id) => next.has(id))) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });

  const devolverSeleccionadosABodega = async () => {
    const ids = [...seleccionados].filter((id) =>
      vistas.some((view) => view.warranty.id === id && view.warranty.status === "recibido"),
    );
    if (ids.length === 0) return;
    const result = await runAction(
      (db2, actor) => devolverGarantiasABodega(db2, actor, { warrantyIds: ids }),
      { success: "warranty.batchReturnedToStock" },
    );
    if (result !== null) setSeleccionados(new Set());
  };

  const agruparEnLotes = (lista: WarrantyView[]): LoteRecibido[] => {
    const lotes = new Map<string, LoteRecibido>();
    for (const view of lista) {
      const { key, title, subtitle, origin } = infoLote(view);
      const actual = lotes.get(key) ?? { key, title, subtitle, origin, views: [] };
      actual.views.push(view);
      lotes.set(key, actual);
    }
    // Array.sort es estable: dentro de un mismo origen se conserva el orden que ya traía la lista.
    return [...lotes.values()].sort((a, b) => ORDEN_ORIGEN[a.origin] - ORDEN_ORIGEN[b.origin]);
  };

  const agruparHistorial = (lista: WarrantyView[]): LoteRecibido[] => {
    const lotes = new Map<string, LoteRecibido>();
    for (const view of lista) {
      const { key, title, subtitle, origin } = infoHistorial(view);
      const actual = lotes.get(key) ?? { key, title, subtitle, origin, views: [] };
      actual.views.push(view);
      lotes.set(key, actual);
    }
    return [...lotes.values()].sort((a, b) => {
      if (a.origin !== b.origin) return ORDEN_ORIGEN[a.origin] - ORDEN_ORIGEN[b.origin];
      const fechaA = Math.max(...a.views.map((view) => Date.parse(view.warranty.receivedAt) || 0));
      const fechaB = Math.max(...b.views.map((view) => Date.parse(view.warranty.receivedAt) || 0));
      return fechaB - fechaA || a.title.localeCompare(b.title, "es");
    });
  };

  // ---------- Exportar garantías recibidas ----------
  /** Casos a exportar: lo seleccionado si hay selección, si no todos los recibidos. */
  const recibidosParaExportar = () => {
    const recibidos = porTab(["recibido"]);
    const lista =
      seleccionados.size > 0
        ? recibidos.filter((view) => seleccionados.has(view.warranty.id))
        : recibidos;
    if (lista.length === 0) {
      toast.error(t("export.noData"));
      return null;
    }
    return lista;
  };

  /** Agrupa los casos por el pedido en común, conservando el orden de la lista. */
  const lotesRecibidos = () => {
    const lista = recibidosParaExportar();
    if (!lista) return null;

    const lotes = new Map<string, { title: string; items: WarrantyCard[] }>();
    for (const view of lista) {
      const info = warrantyInfo(view);
      // Con pedido, el lote es el pedido. Sin pedido, se agrupa por cliente para
      // que tampoco se mezclen equipos de clientes distintos.
      const clave = view.order
        ? `pedido:${view.order.id}`
        : `sin-pedido:${view.warranty.customerId ?? view.warranty.clienteManual ?? "sin-datos"}`;
      const cliente = view.customer?.name ?? view.warranty.clienteManual;
      const base = view.order
        ? `${t("export.pedido")} ${view.order.code}`
        : t("export.withoutOrder");
      const actual = lotes.get(clave) ?? {
        title: cliente ? `${base} · ${cliente}` : base,
        items: [],
      };
      actual.items.push({
        product: info.producto,
        serial: info.serial,
        receivedAt: view.warranty.receivedAt,
        location: view.unit?.location,
        reason: view.warranty.reason,
      });
      lotes.set(clave, actual);
    }
    return [...lotes.values()];
  };

  const exportarRecibidosPdf = () => {
    const groups = lotesRecibidos();
    if (!groups) return;
    const total = groups.reduce((suma, group) => suma + group.items.length, 0);
    exportWarrantyPdf({
      title: t("export.warrantiesTitle"),
      subtitle: exportSubtitleEquipos(
        total,
        seleccionados.size > 0 ? t("export.selectionNote") : undefined,
      ),
      groups,
      filename: `garantias-recibidas-${todayIso()}.pdf`,
      labels: {
        serial: t("export.serial"),
        received: t("export.received"),
        units: (count) => t("export.unitsCount", { count }),
      },
    });
  };

  const filasExportarRecibidos = () => {
    const lista = recibidosParaExportar();
    if (!lista) return null;
    return lista.map((view) => {
      const info = warrantyInfo(view);
      return [
        view.warranty.code,
        info.serial ?? "—",
        info.producto,
        info.cliente,
        view.order?.code ?? "—",
        formatDateTime(view.warranty.receivedAt),
        view.warranty.reason ?? "—",
        t(`warrantyStatus.${view.warranty.status}`),
        t(`warranty.origin.${getWarrantyOrigin(view.warranty, view.order)}`),
      ];
    });
  };

  const exportarRecibidosExcel = () => {
    const body = filasExportarRecibidos();
    if (!body) return;
    exportExcel({
      filename: `garantias-recibidas-${todayIso()}.xlsx`,
      sheets: [
        {
          name: "Garantías recibidas",
          title: `${t("export.warrantiesTitle")} — ${exportCompanyName(db.settings.companyName)}`,
          subtitle: exportSubtitle(body.length),
          columns: [
            t("warranty.code"),
            t("export.serial"),
            t("export.producto"),
            t("export.cliente"),
            t("export.pedido"),
            t("export.fechaRecepcion"),
            t("warranty.reason"),
            t("export.estado"),
            t("warranty.origin.label"),
          ],
          rows: body,
          wrapColumns: [6],
        },
      ],
    });
  };

  // ---------- Exportar garantías en servicio técnico ----------
  /** Mismo orden que se ve en pantalla: las más antiguas primero. */
  const enServicioOrdenado = () =>
    [...porTab(["en_servicio_tecnico"])].sort((a, b) =>
      a.warranty.receivedAt.localeCompare(b.warranty.receivedAt),
    );

  const servicioParaExportar = () => {
    const lista = enServicioOrdenado();
    if (lista.length === 0) {
      toast.error(t("export.noData"));
      return null;
    }
    return lista;
  };

  /** Mismos lotes que se ven en pantalla (por pedido, falla de inventario o garantía previa),
   * en el mismo orden: falla de inventario, luego normal, luego previa. */
  const lotesServicio = () => {
    const lista = servicioParaExportar();
    if (!lista) return null;

    const lotes = new Map<string, { title: string; origin: WarrantyOrigin; items: WarrantyCard[] }>();
    for (const view of lista) {
      const info = warrantyInfo(view);
      const { key, title, subtitle, origin } = infoLote(view);
      const actual = lotes.get(key) ?? {
        title: subtitle ? `${title} · ${subtitle}` : title,
        origin,
        items: [],
      };
      actual.items.push({
        product: info.producto,
        serial: info.serial,
        receivedAt: view.warranty.receivedAt,
        location: view.unit?.location,
        reason: view.warranty.reason,
        technician: view.tecnico?.nombre,
      });
      lotes.set(key, actual);
    }
    return [...lotes.values()].sort((a, b) => ORDEN_ORIGEN[a.origin] - ORDEN_ORIGEN[b.origin]);
  };

  const exportarServicioPdf = () => {
    const groups = lotesServicio();
    if (!groups) return;
    const total = groups.reduce((suma, group) => suma + group.items.length, 0);
    exportWarrantyPdf({
      title: t("export.servicioTitle"),
      subtitle: exportSubtitleEquipos(total),
      groups,
      filename: `garantias-en-servicio-${todayIso()}.pdf`,
      labels: {
        serial: t("export.serial"),
        received: t("export.received"),
        units: (count) => t("export.unitsCount", { count }),
        technician: t("export.tecnico"),
      },
    });
  };

  const filasExportarServicio = () => {
    const lista = servicioParaExportar();
    if (!lista) return null;
    return lista.map((view) => {
      const info = warrantyInfo(view);
      return [
        view.warranty.code,
        info.serial ?? "—",
        info.producto,
        info.cliente,
        view.order?.code ?? "—",
        view.tecnico?.nombre ?? "—",
        formatDateTime(view.warranty.receivedAt),
        diasPorCaso.get(view.warranty.id) ?? 0,
        view.warranty.reason ?? "—",
        t(`warranty.origin.${getWarrantyOrigin(view.warranty, view.order)}`),
      ];
    });
  };

  const exportarServicioExcel = () => {
    const body = filasExportarServicio();
    if (!body) return;
    exportExcel({
      filename: `garantias-en-servicio-${todayIso()}.xlsx`,
      sheets: [
        {
          name: "Garantías en servicio",
          title: `${t("export.servicioTitle")} — ${exportCompanyName(db.settings.companyName)}`,
          subtitle: exportSubtitle(body.length),
          columns: [
            t("warranty.code"),
            t("export.serial"),
            t("export.producto"),
            t("export.cliente"),
            t("export.pedido"),
            t("export.tecnico"),
            t("export.fechaRecepcion"),
            t("export.diasEnServicio"),
            t("warranty.reason"),
            t("warranty.origin.label"),
          ],
          rows: body,
          wrapColumns: [8],
        },
      ],
    });
  };

  // ---------- Reenvío pendiente: filtros y exportación ----------
  const reenvioTodos = porTab(["reenvio_pendiente"]);
  const reenvioFiltrados = filtrarReenvio(reenvioTodos, filtroReenvio);
  const tecnicosReenvio = (() => {
    const porId = new Map<string, { id: string; nombre: string }>();
    for (const view of reenvioTodos) {
      if (view.tecnico) porId.set(view.tecnico.id, view.tecnico);
    }
    return [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  })();

  /** Los filtros activos, escritos para que el archivo diga con qué criterio se generó. */
  const notaFiltrosReenvio = () => {
    if (!hayFiltroReenvio(filtroReenvio)) return undefined;
    const partes: string[] = [];
    if (filtroReenvio.texto.trim()) {
      partes.push(`${t("warranty.reenvio.busqueda")}: "${filtroReenvio.texto.trim()}"`);
    }
    if (filtroReenvio.resolucion) {
      partes.push(`${t("export.resolucion")}: ${t(`warrantyResolution.${filtroReenvio.resolucion}`)}`);
    }
    if (filtroReenvio.origen) {
      partes.push(`${t("warranty.origin.label")}: ${t(`warranty.origin.${filtroReenvio.origen}`)}`);
    }
    if (filtroReenvio.tecnicoId) {
      const nombre = tecnicosReenvio.find((tecnico) => tecnico.id === filtroReenvio.tecnicoId)?.nombre;
      if (nombre) partes.push(`${t("export.tecnico")}: ${nombre}`);
    }
    if (filtroReenvio.desde) partes.push(`${t("export.desde")}: ${filtroReenvio.desde}`);
    if (filtroReenvio.hasta) partes.push(`${t("export.hasta")}: ${filtroReenvio.hasta}`);
    return partes.join(" · ");
  };

  const reenvioParaExportar = () => {
    if (reenvioFiltrados.length === 0) {
      toast.error(t("export.noData"));
      return null;
    }
    return reenvioFiltrados;
  };

  /** Mismos lotes que se ven en pantalla, en el mismo orden (falla de inventario, normal, previa). */
  const lotesReenvio = () => {
    const lista = reenvioParaExportar();
    if (!lista) return null;
    const lotes = new Map<string, { title: string; origin: WarrantyOrigin; items: WarrantyCard[] }>();
    for (const view of lista) {
      const info = warrantyInfo(view);
      const { key, title, subtitle, origin } = infoLote(view);
      const actual = lotes.get(key) ?? {
        title: subtitle ? `${title} · ${subtitle}` : title,
        origin,
        items: [],
      };
      actual.items.push({
        product: info.producto,
        serial: info.serial,
        receivedAt: view.warranty.receivedAt,
        location: view.unit?.location,
        reason: view.warranty.reason,
        technician: view.tecnico?.nombre,
        resolution: view.warranty.resolucion
          ? t(`warrantyResolution.${view.warranty.resolucion}`)
          : undefined,
      });
      lotes.set(key, actual);
    }
    return [...lotes.values()].sort((a, b) => ORDEN_ORIGEN[a.origin] - ORDEN_ORIGEN[b.origin]);
  };

  const exportarReenvioPdf = () => {
    const groups = lotesReenvio();
    if (!groups) return;
    const total = groups.reduce((suma, group) => suma + group.items.length, 0);
    exportWarrantyPdf({
      title: t("export.reenvioTitle"),
      subtitle: exportSubtitleEquipos(total, notaFiltrosReenvio()),
      groups,
      filename: `garantias-reenvio-${todayIso()}.pdf`,
      labels: {
        serial: t("export.serial"),
        received: t("export.received"),
        units: (count) => t("export.unitsCount", { count }),
        technician: t("export.tecnico"),
      },
    });
  };

  const exportarReenvioExcel = () => {
    const lista = reenvioParaExportar();
    if (!lista) return;
    const body = lista.map((view) => {
      const info = warrantyInfo(view);
      const reemplazo = view.warranty.replacementUnitId
        ? db.units.find((unit) => unit.id === view.warranty.replacementUnitId)?.serial
        : undefined;
      return [
        view.warranty.code,
        info.serial ?? "—",
        info.producto,
        info.cliente,
        view.order?.code ?? "—",
        view.tecnico?.nombre ?? "—",
        view.warranty.resolucion ? t(`warrantyResolution.${view.warranty.resolucion}`) : "—",
        reemplazo ?? "—",
        formatDateTime(view.warranty.receivedAt),
        diasPorCaso.get(view.warranty.id) ?? 0,
        view.warranty.reason ?? "—",
        t(`warranty.origin.${getWarrantyOrigin(view.warranty, view.order)}`),
      ];
    });
    exportExcel({
      filename: `garantias-reenvio-${todayIso()}.xlsx`,
      sheets: [
        {
          name: "Garantías en reenvío",
          title: `${t("export.reenvioTitle")} — ${exportCompanyName(db.settings.companyName)}`,
          subtitle: exportSubtitle(body.length, notaFiltrosReenvio()),
          columns: [
            t("warranty.code"),
            t("export.serial"),
            t("export.producto"),
            t("export.cliente"),
            t("export.pedido"),
            t("export.tecnico"),
            t("export.resolucion"),
            t("export.serialReemplazo"),
            t("export.fechaRecepcion"),
            t("export.diasPendiente"),
            t("warranty.reason"),
            t("warranty.origin.label"),
          ],
          rows: body,
          wrapColumns: [10],
        },
      ],
    });
  };

  // ---------- Buscar IMEI ----------
  const buscarPorImei = (serial: string) => {
    const valor = serial.trim();
    if (!valor) return;
    setBuscarResultado(valor);
  };

  const renderAviso = () =>
    aviso ? (
      <div
        role="alert"
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm",
          aviso.tone === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
          aviso.tone === "warning" && "border-warning/40 bg-warning/10 text-warning",
          aviso.tone === "info" && "border-info/40 bg-info/10 text-info",
        )}
      >
        <span className="whitespace-pre-line">{aviso.text}</span>
        {aviso.previaSerial ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => usarComoPrevia(aviso.previaSerial ?? "")}
          >
            {t("warranty.usePrevia")}
          </Button>
        ) : null}
      </div>
    ) : null;

  const renderCard = (view: WarrantyView) => {
    const info = warrantyInfo(view);
    const isOpen = view.open;
    const notaFinal = view.events.length > 0 ? view.events[view.events.length - 1].notes ?? "" : "";
    const finalDisponible = notaFinal.toLowerCase().includes("disponible en bodega");
    const finalEntregado = notaFinal.toLowerCase().includes("entregado al cliente");
    const estancadaDias = isOpen ? (diasPorCaso.get(view.warranty.id) ?? 0) : 0;
    return (
      <div id={`garantia-operativa-${view.warranty.id}`} key={view.warranty.id} className={cn("surface-hover scroll-mt-24 rounded-lg border bg-card p-4 shadow-sm", focusId === view.warranty.id && "border-primary ring-2 ring-primary/35 shadow-lg shadow-primary/10")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-tabular truncate text-sm font-semibold">
              {view.warranty.code}
            </p>
            <p className="font-tabular mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              {info.serial ?? "—"}
              {info.serial && esCodigoInterno(info.serial) ? <PendingImeiBadge /> : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <WarrantyStatusBadge status={view.warranty.status} />
            {!isOpen && finalDisponible ? <Badge label={t("warranty.finalDestination.stock")} withDot={false} /> : null}
            {!isOpen && finalEntregado ? <Badge label={t("warranty.finalDestination.customer")} withDot={false} /> : null}
            <WarrantyOriginBadge origin={getWarrantyOrigin(view.warranty, view.order)} />
            {estancadaDias >= DIAS_GARANTIA_ESTANCADA ? (
              <Badge
                tone={estancadaDias >= DIAS_GARANTIA_CRITICA ? "destructive" : "warning"}
                label={t("warranty.stalled", { count: estancadaDias })}
                withDot={false}
              />
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-2">
          <ProductThumbnail src={view.product?.imageUrl} alt={info.producto} size="sm" />
          <p className="truncate text-sm">{info.producto}</p>
        </div>
        <p className="truncate text-xs text-muted-foreground">{info.cliente}</p>
        {view.warranty.replacementUnitId ? (
          <p className="mt-1 break-all text-xs font-medium text-primary">
            Serial de reemplazo para el cliente: {db.units.find((unit) => unit.id === view.warranty.replacementUnitId)?.serial ?? "—"}
          </p>
        ) : null}
        {!isOpen && view.events.length > 0 && view.events[view.events.length - 1].notes ? (
          <p className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
            {view.events[view.events.length - 1].notes}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(view.warranty.receivedAt)}</p>
        {view.tecnico ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("warranty.tecnico")}: {view.tecnico.nombre}
          </p>
        ) : null}
        {view.warranty.resolucion ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge
              label={t(`warrantyResolution.${view.warranty.resolucion}`)}
              withDot={false}
            />
            {view.warranty.costo ? (
              <Badge label={`${t("warranty.cost")}: ${view.warranty.costo}`} withDot={false} />
            ) : null}
          </div>
        ) : null}
        {view.warranty.diagnostico ? (
          <p className="mt-2 text-xs text-muted-foreground">{view.warranty.diagnostico}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isOpen ? (
            <>
              {view.warranty.status === "recibido" ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={seleccionados.has(view.warranty.id)}
                    onChange={() => toggleSeleccion(view.warranty.id)}
                  />
                  {t("common.select")}
                </label>
              ) : null}
              {view.warranty.status === "en_servicio_tecnico" ? (
                <>
                  <DiagnosticoDialog
                    warranty={view.warranty}
                    trigger={<Button size="sm" variant="outline">{t("warranty.diagnose")}</Button>}
                  />
                  <DevolverDialog
                    warranty={view.warranty}
                    trigger={
                      <Button size="sm" variant="ghost" className="text-destructive">
                        {t("warranty.return")}
                      </Button>
                    }
                  />
                </>
              ) : null}
              {view.warranty.status === "reenvio_pendiente" ? (
                <>
                  <EntregarDialog
                    warranty={view.warranty}
                    trigger={
                      <Button size="sm">
                        {getWarrantyOrigin(view.warranty, view.order) === "falla_inventario"
                          ? (view.warranty.resolucion === "cambio"
                              ? t("warranty.inventoryChangeConfirm")
                              : t("warranty.resolveToStock"))
                          : t("warranty.deliver")}
                      </Button>
                    }
                  />
                  <DevolverDialog
                    warranty={view.warranty}
                    trigger={
                      <Button size="sm" variant="outline" className="text-destructive">
                        {t("warranty.return")}
                      </Button>
                    }
                  />
                </>
              ) : null}
              {view.warranty.status === "recibido" ? (
                <DevolverDialog
                  warranty={view.warranty}
                  trigger={
                    <Button size="sm" variant="ghost" className="text-destructive">
                      {t("warranty.return")}
                    </Button>
                  }
                />
              ) : null}
            </>
          ) : null}
          <DeshacerEstadoButton warranty={view.warranty} />
          <Button size="sm" variant="ghost" asChild>
            <Link to={`/garantias/${view.warranty.id}`}>{t("common.view")}</Link>
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="nx-management nx-warranties space-y-5 stagger">
      <PageHeader title={t("warranty.title")} description={t("warranty.subtitle")} />

      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-primary" /> Estadísticas de garantías</h2>
            <p className="mt-1 text-xs text-muted-foreground">Análisis de incidencias y diagnósticos registrados, sin modificar información.</p>
          </div>
          <Button type="button" variant={mostrarEstadisticas ? "default" : "outline"} size="sm" onClick={() => setMostrarEstadisticas((actual) => !actual)}>
            {mostrarEstadisticas ? "Ocultar estadísticas" : "Ver estadísticas"}
          </Button>
        </div>
        {mostrarEstadisticas ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-xs font-medium">Desde
                <Input type="date" value={estadisticaDesde} onChange={(event) => setEstadisticaDesde(event.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-medium">Hasta
                <Input type="date" value={estadisticaHasta} onChange={(event) => setEstadisticaHasta(event.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-medium">Referencia
                <select value={estadisticaReferencia} onChange={(event) => setEstadisticaReferencia(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Todas las referencias</option>
                  {referenciasEstadisticas.map((referencia) => <option key={referencia} value={referencia}>{referencia}</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Filtros aplicados por fecha de recepción de la garantía.</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => { setEstadisticaDesde(""); setEstadisticaHasta(""); setEstadisticaReferencia(""); }}>Limpiar filtros</Button>
                <Button type="button" size="sm" onClick={exportarEstadisticas} disabled={estadisticas.total === 0}><FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar CSV</Button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Registradas", estadisticas.total],
                ["Abiertas", estadisticas.abiertas],
                ["Cerradas", estadisticas.cerradas],
                ["Promedio hasta resolución", estadisticas.promedioDias === null ? "Sin datos" : `${estadisticas.promedioDias.toFixed(1)} días`],
              ].map(([titulo, valor]) => <div key={titulo} className="rounded-lg border bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{titulo}</p><p className="mt-1 text-xl font-bold tabular-nums">{valor}</p></div>)}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Reparado", estadisticas.reparadas],
                ["Cambio", estadisticas.cambios],
                ["Defectuoso", estadisticas.defectuosas],
                ["Sin falla", estadisticas.sinFalla],
              ].map(([titulo, valor]) => <div key={titulo} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Diagnóstico: {titulo}</p><p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p></div>)}
            </div>
            <p className="text-xs text-muted-foreground">Los diagnósticos no equivalen al destino de entrega: un reembolso no se clasifica automáticamente como defectuoso. El reembolso no tiene un campo estadístico independiente en los registros actuales.</p>
            <div className="grid gap-4 lg:grid-cols-2">
              {[
                { titulo: "Referencias con más garantías", filas: estadisticas.referencias },
                { titulo: "Motivos de ingreso más frecuentes", filas: estadisticas.motivos },
              ].map(({ titulo, filas }) => (
                <div key={titulo} className="overflow-hidden rounded-lg border">
                  <h3 className="border-b bg-muted/30 px-4 py-3 text-sm font-semibold">{titulo}</h3>
                  {filas.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">Sin resultados para estos filtros.</p> : (
                    <div className="max-h-72 overflow-y-auto divide-y">
                      {filas.map(([nombre, cantidad], index) => (
                        <div key={nombre} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                          <span className="min-w-0 break-words"><span className="mr-2 text-xs text-muted-foreground">{index + 1}.</span>{nombre}</span>
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{cantidad}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2 rounded-lg border bg-card p-3 shadow-sm">
        {TABS.map((option) => (
          <Button
            key={option}
            variant={tab === option ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setTab(option);
              setAviso(null);
            }}
          >
            {t(`warranty.tab.${option}`)}
            {badgeDeTab(option) > 0 ? (
              <span
                key={badgeDeTab(option)}
                className="ml-1 animate-pop-in rounded-full bg-background/20 px-1.5 text-xs motion-reduce:animate-none"
              >
                {badgeDeTab(option)}
              </span>
            ) : null}
          </Button>
        ))}
        {totalEstancadas > 0 && (tab === "recibidos" || tab === "servicio" || tab === "reenvio") ? (
          <Button
            variant={soloEstancadas ? "default" : "outline"}
            size="sm"
            aria-pressed={soloEstancadas}
            onClick={() => setSoloEstancadas((activo) => !activo)}
            className="ml-auto"
          >
            <TriangleAlert />
            {t("warranty.onlyStalled")}
            <span className="ml-1 rounded-full bg-background/20 px-1.5 text-xs">
              {totalEstancadas}
            </span>
          </Button>
        ) : null}
      </div>

      {/* ============ RECIBIR ============ */}
      {tab === "recibir" ? (
        <section className="animate-fade-in space-y-4 rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {(["imei", "previa", "falla"] as const).map((option) => (
              <Button
                key={option}
                variant={modo === option ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  setModo(option);
                  setUnidadEncontrada(null);
                  setLote([]);
                  setAviso(null);
                  setArchivoUno(null);
                  setArchivoLote(null);
                }}
              >
                {t(`warranty.mode.${option}`)}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {t(modo === "falla" ? "warranty.inventoryFaultHint" : "warranty.intakeHint")}
          </p>

          {modo === "imei" || modo === "falla" ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={imeiMode === "uno" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setImeiMode("uno");
                    setAviso(null);
                  }}
                >
                  {t("warranty.oneByOne")}
                </Button>
                <Button
                  variant={imeiMode === "lote" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setImeiMode("lote");
                    setAviso(null);
                  }}
                >
                  {t("warranty.byLot")}
                </Button>
              </div>

              {imeiMode === "uno" ? (
                <div className="space-y-3">
                  <SerialScanInput
                    onScan={buscarUnidadParaGarantia}
                    hint={t(`warranty.scanHint.${modo}`)}
                  />
                  {renderAviso()}
                  {unidadEncontrada ? (
                    <div
                      className="space-y-3 rounded-md border bg-muted/40 p-4"
                      onKeyDown={onEnter(() => {
                        if (motivoUno.trim()) void recibirUno();
                      })}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-tabular font-semibold">{unidadEncontrada.serial}</p>
                          <p className="text-sm text-muted-foreground">
                            {productoDeUnidad(unidadEncontrada)}
                          </p>
                        </div>
                        <Badge
                          label={t(`unitStatus.${unidadEncontrada.status}`)}
                          withDot={false}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {unidadInfo.folio ? <Badge label={`${t("nav.orders")}: ${unidadInfo.folio}`} withDot={false} /> : null}
                        {unidadInfo.cliente ? <Badge label={unidadInfo.cliente} withDot={false} /> : null}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="motivoUno">{t("warranty.reason")}</Label>
                        <Textarea
                          id="motivoUno"
                          rows={2}
                          value={motivoUno}
                          placeholder={t("warranty.reasonPlaceholder")}
                          onChange={(event) => setMotivoUno(event.target.value)}
                        />
                      </div>
                      <SelectorDocumentoGarantia archivo={archivoUno} onChange={setArchivoUno} />
                      <Button
                        type="button"
                        loading={runAction.pending}
                        disabled={!motivoUno.trim()}
                        onClick={() => void recibirUno()}
                      >
                        {t("warranty.create")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  <SerialScanInput
                    onScan={agregarLote}
                    hint={t("warranty.scanContinuous")}
                  />
                  {renderAviso()}
                  {lote.length > 0 ? (
                    <>
                      <ul
                        className="divide-y rounded-md border"
                        onKeyDown={onEnter(() => {
                          if (!lote.some((item) => !(loteObs[item.imei] ?? item.obs).trim())) {
                            void recibirLote();
                          }
                        })}
                      >
                        {lote.map((item) => (
                          <li key={item.imei} className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-tabular truncate text-sm">{item.imei}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {item.producto} · {item.folio} · {item.cliente}
                                </p>
                              </div>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive"
                                onClick={() => setLote((previous) => previous.filter((x) => x.imei !== item.imei))}
                              >
                                ✕
                              </Button>
                            </div>
                            <Textarea
                              rows={1}
                              className="mt-2 h-9"
                              placeholder={t("warranty.reason")}
                              value={loteObs[item.imei] ?? item.obs}
                              onChange={(event) =>
                                setLoteObs((previous) => ({ ...previous, [item.imei]: event.target.value }))
                              }
                            />
                          </li>
                        ))}
                      </ul>
                      <SelectorDocumentoGarantia archivo={archivoLote} onChange={setArchivoLote} />
                      <Button
                        type="button"
                        loading={runAction.pending}
                        disabled={lote.some((item) => !(loteObs[item.imei] ?? item.obs).trim())}
                        onClick={() => void recibirLote()}
                      >
                        {t("warranty.receiveAll")}
                      </Button>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {modo === "previa" ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={previaMode === "uno" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setPreviaMode("uno");
                    setAviso(null);
                  }}
                >
                  {t("warranty.oneByOne")}
                </Button>
                <Button
                  variant={previaMode === "lote" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setPreviaMode("lote");
                    setAviso(null);
                  }}
                >
                  {t("warranty.byLot")}
                </Button>
              </div>

              {previaMode === "uno" ? (
            <div
              className="grid gap-3 sm:grid-cols-2"
              onKeyDown={onEnter(() => {
                if (previa.imei && previa.referencia && previa.cliente && previa.motivo) {
                  void recibirPrevia();
                }
              })}
            >
              <div className="space-y-2">
                <Label>{t("warranty.previaSerial")}</Label>
                <Input
                  value={previa.imei}
                  placeholder="IMEI o serial"
                  onChange={(event) => setPrevia({ ...previa, imei: event.target.value })}
                  className="font-tabular"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPrevia({
                      ...previa,
                      imei: generarCodigoInterno(
                        (serial) =>
                          db.units.some((unit) => unit.serial === serial) ||
                          db.warranties.some((warranty) => warranty.imeiManual === serial),
                      ),
                    })
                  }
                >
                  <Plus />
                  {t("receptions.addPendingImei")}
                </Button>
              </div>
              <div className="space-y-2">
                <Label>{t("warranty.previaReferencia")}</Label>
                <OptionSelect
                  value={previa.referencia || undefined}
                  onChange={(referencia) => setPrevia({ ...previa, referencia })}
                  options={referenciasInventario.map((referencia) => ({ value: referencia, label: referencia }))}
                  placeholder={t("warranty.previaReferenciaPlaceholder")}
                  emptyLabel={t("common.select")}
                  disabled={referenciasInventario.length === 0}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("warranty.previaCliente")}</Label>
                <ClienteTecnologiaSelect
                  value={previa.cliente}
                  clientes={clientesTecnologia}
                  onChange={(cliente) => setPrevia({ ...previa, cliente })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("warranty.previaFecha")}</Label>
                <Input
                  type="date"
                  value={previa.fecha}
                  onChange={(event) => setPrevia({ ...previa, fecha: event.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>{t("warranty.reason")}</Label>
                <Textarea
                  rows={2}
                  value={previa.motivo}
                  placeholder={t("warranty.reasonPlaceholder")}
                  onChange={(event) => setPrevia({ ...previa, motivo: event.target.value })}
                />
              </div>
              <Button
                type="button"
                loading={runAction.pending}
                disabled={!previa.imei || !previa.referencia || !previa.cliente || !previa.motivo}
                onClick={() => void recibirPrevia()}
                className="sm:col-span-2"
              >
                {t("warranty.create")}
              </Button>
            </div>
              ) : (
                <div className="space-y-3">
                  <div
                    className="grid gap-3 rounded-md border bg-muted/40 p-4 sm:grid-cols-2"
                    onKeyDown={onEnter(() => {
                      if (
                        previaLoteDraft.imei &&
                        previaLoteDraft.referencia &&
                        previaLoteDraft.cliente &&
                        previaLoteDraft.motivo
                      ) {
                        agregarLotePrevia();
                      }
                    })}
                  >
                    <div className="space-y-2">
                      <Label>{t("warranty.previaSerial")}</Label>
                      <Input
                        value={previaLoteDraft.imei}
                        placeholder="IMEI o serial"
                        onChange={(event) =>
                          setPreviaLoteDraft({ ...previaLoteDraft, imei: event.target.value })
                        }
                        className="font-tabular"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPreviaLoteDraft({
                            ...previaLoteDraft,
                            imei: generarCodigoInterno(
                              (serial) =>
                                db.units.some((unit) => unit.serial === serial) ||
                                db.warranties.some((warranty) => warranty.imeiManual === serial) ||
                                lotePrevias.some((item) => item.imei === serial),
                            ),
                          })
                        }
                      >
                        <Plus />
                        {t("receptions.addPendingImei")}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("warranty.previaReferencia")}</Label>
                      <OptionSelect
                        value={previaLoteDraft.referencia || undefined}
                        onChange={(referencia) => setPreviaLoteDraft({ ...previaLoteDraft, referencia })}
                        options={referenciasInventario.map((referencia) => ({ value: referencia, label: referencia }))}
                        placeholder={t("warranty.previaReferenciaPlaceholder")}
                        emptyLabel={t("common.select")}
                        disabled={referenciasInventario.length === 0}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("warranty.previaCliente")}</Label>
                      <ClienteTecnologiaSelect
                        value={previaLoteDraft.cliente}
                        clientes={clientesTecnologia}
                        onChange={(cliente) => setPreviaLoteDraft({ ...previaLoteDraft, cliente })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("warranty.previaFecha")}</Label>
                      <Input
                        type="date"
                        value={previaLoteDraft.fecha}
                        onChange={(event) =>
                          setPreviaLoteDraft({ ...previaLoteDraft, fecha: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>{t("warranty.reason")}</Label>
                      <Textarea
                        rows={2}
                        value={previaLoteDraft.motivo}
                        placeholder={t("warranty.reasonPlaceholder")}
                        onChange={(event) =>
                          setPreviaLoteDraft({ ...previaLoteDraft, motivo: event.target.value })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        !previaLoteDraft.imei ||
                        !previaLoteDraft.referencia ||
                        !previaLoteDraft.cliente ||
                        !previaLoteDraft.motivo
                      }
                      onClick={agregarLotePrevia}
                      className="sm:col-span-2"
                    >
                      <Plus />
                      {t("common.add")}
                    </Button>
                  </div>

                  {renderAviso()}

                  {lotePrevias.length > 0 ? (
                    <>
                      <ul className="divide-y rounded-md border">
                        {lotePrevias.map((item) => (
                          <li key={item.imei} className="flex items-start justify-between gap-2 p-3">
                            <div className="min-w-0">
                              <p className="font-tabular truncate text-sm">{item.imei}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {item.referencia} · {item.cliente}
                                {item.fecha ? ` · ${item.fecha}` : ""}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{item.motivo}</p>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() =>
                                setLotePrevias((previous) => previous.filter((x) => x.imei !== item.imei))
                              }
                            >
                              ✕
                            </Button>
                          </li>
                        ))}
                      </ul>
                      <SelectorDocumentoGarantia archivo={archivoLotePrevias} onChange={setArchivoLotePrevias} />
                      <Button
                        type="button"
                        loading={runAction.pending}
                        onClick={() => void recibirLotePrevias()}
                      >
                        {t("warranty.receiveAll")}
                      </Button>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ============ RECIBIDOS ============ */}
      {tab === "recibidos" ? (
        <div className="animate-fade-in space-y-3">
          {porTab(["recibido"]).length > 0 || isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              {porTab(["recibido"]).length > 0 ? (
                <>
                  <TecnicosDialog
                    onSelect={(tecnicoId) => void enviarSeleccionados(tecnicoId)}
                    trigger={
                      <Button variant="outline" size="sm" disabled={seleccionados.size === 0}>
                        <Send />
                        {t("warranty.sendSelected", { count: seleccionados.size })}
                      </Button>
                    }
                  />
                  {seleccionados.size > 0 ? (
                    <ConfirmDialog
                      trigger={
                        <Button variant="outline" size="sm">
                          <PackageCheck />
                          {t("warranty.returnSelectedToStock", { count: seleccionados.size })}
                        </Button>
                      }
                      title={t("warranty.returnSelectedToStockTitle", { count: seleccionados.size })}
                      description={t("warranty.returnSelectedToStockHint")}
                      confirmLabel={t("warranty.returnSelectedToStockConfirm")}
                      onConfirm={() => void devolverSeleccionadosABodega()}
                    />
                  ) : null}
                  <Button variant="outline" size="sm" onClick={exportarRecibidosPdf}>
                    <FileText />
                    {t("export.pdf")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportarRecibidosExcel}>
                    <FileSpreadsheet />
                    {t("export.excel")}
                  </Button>
                </>
              ) : null}
              {isAdmin ? (
                <TecnicosDialog
                  trigger={
                    <Button variant="ghost" size="sm">
                      {t("warranty.tecnicoManage")}
                    </Button>
                  }
                />
              ) : null}
            </div>
          ) : null}
          {porTab(["recibido"]).length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title={t("warranty.emptyRecibidos")}
              description={t("warranty.emptyRecibidosHint")}
            />
          ) : (
            <div className="space-y-4">
              {agruparEnLotes(porTab(["recibido"])).map((lote) => {
                const todosMarcados = lote.views.every((view) => seleccionados.has(view.warranty.id));
                return (
                  <LoteGarantias
                    key={lote.key}
                    lote={lote}
                    cerrado={!lotesAbiertos.has(lote.key)}
                    onToggle={() => toggleLoteAbierto(lote.key)}
                    renderCard={renderCard}
                    t={t}
                    acciones={
                      <Button type="button" size="sm" variant="outline" onClick={() => toggleSeleccionLote(lote)}>
                        {todosMarcados ? t("warranty.lote.deselectAll") : t("warranty.lote.selectAll")}
                      </Button>
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* ============ EN SERVICIO TÉCNICO ============ */}
      {tab === "servicio" ? (
        <div className="animate-fade-in space-y-3">
          {(() => {
            // Aquí sí por fecha de recepción (las más antiguas primero): a diferencia de
            // Recibidos/Reenvío, en Servicio se pidió expresamente que no dependiera de si el
            // caso tuvo movimientos recientes. agruparEnLotes conserva ese orden: cada lote
            // queda ubicado donde apareció su primer caso, así que el lote más viejo sigue
            // apareciendo primero.
            const enServicio = enServicioOrdenado();
            return (
              <>
                {enServicio.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={exportarServicioPdf}>
                      <FileText />
                      {t("export.pdf")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportarServicioExcel}>
                      <FileSpreadsheet />
                      {t("export.excel")}
                    </Button>
                  </div>
                ) : null}
                {enServicio.length === 0 ? (
                  <EmptyState icon={Wrench} title={t("warranty.emptyServicio")} description={t("warranty.emptyServicioDescription")} />
                ) : (
                  <div className="space-y-4">
                    {agruparEnLotes(enServicio).map((lote) => (
                      <LoteGarantias
                        key={lote.key}
                        lote={lote}
                        cerrado={!lotesAbiertos.has(lote.key)}
                        onToggle={() => toggleLoteAbierto(lote.key)}
                        renderCard={renderCard}
                        t={t}
                      />
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : null}

      {/* ============ REENVÍO PENDIENTE ============ */}
      {tab === "reenvio" ? (
        <div className="animate-fade-in space-y-3">
          {reenvioTodos.length === 0 ? (
            <EmptyState icon={ShieldCheck} title={t("warranty.emptyReenvio")} description={t("warranty.emptyReenvioDescription")} />
          ) : (
            <>
              <FiltrosReenvio
                filtro={filtroReenvio}
                onChange={setFiltroReenvio}
                tecnicos={tecnicosReenvio}
                total={reenvioTodos.length}
                mostrados={reenvioFiltrados.length}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={exportarReenvioPdf}>
                  <FileText />
                  {t("export.pdf")}
                </Button>
                <Button variant="outline" size="sm" onClick={exportarReenvioExcel}>
                  <FileSpreadsheet />
                  {t("export.excel")}
                </Button>
              </div>
              {reenvioFiltrados.length === 0 ? (
                <EmptyState icon={PackageSearch} title={t("warranty.reenvio.sinResultados")} />
              ) : (
                // Mismos lotes plegables que Recibidos y Servicio: cada tarjeta de lote (pedido,
                // día de falla de inventario o cliente) guarda dentro sus casos pendientes de reenvío.
                <div className="space-y-4">
                  {agruparEnLotes(reenvioFiltrados).map((lote) => (
                    <LoteGarantias
                      key={lote.key}
                      lote={lote}
                      cerrado={!lotesAbiertos.has(lote.key)}
                      onToggle={() => toggleLoteAbierto(lote.key)}
                      renderCard={renderCard}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : null}

      {/* ============ HISTORIAL ============ */}
      {tab === "historial" ? (
        <div className="animate-fade-in space-y-3">
          <Input
            {...SEARCH_INPUT_PROPS}
            value={filtroHistorial}
            placeholder="Buscar por referencia, IMEI, cliente o código de garantía"
            onChange={(event) => setFiltroHistorial(event.target.value)}
          />
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1 space-y-1">
              <Label htmlFor="historial-referencia">Filtrar por referencia</Label>
              <select
                id="historial-referencia"
                value={referenciaHistorial}
                onChange={(event) => setReferenciaHistorial(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">Todas las referencias</option>
                {referenciasHistorial.map((referencia) => (
                  <option key={referencia} value={referencia}>{referencia}</option>
                ))}
              </select>
            </div>
            {(filtroHistorial || referenciaHistorial) ? (
              <Button type="button" variant="outline" onClick={() => { setFiltroHistorial(""); setReferenciaHistorial(""); }}>
                Limpiar filtros
              </Button>
            ) : null}
          </div>
          {(() => {
            const q = filtroHistorial.trim().toLowerCase();
            const rows = casosHistorial.filter(
              (v) =>
                (!referenciaHistorial || (v.product?.name ?? v.warranty.referenciaManual ?? "").trim() === referenciaHistorial) &&
                (!q ||
                v.warranty.code.toLowerCase().includes(q) ||
                (v.unit?.serial ?? "").toLowerCase().includes(q) ||
                (v.warranty.imeiManual ?? "").toLowerCase().includes(q) ||
                (v.customer?.name ?? v.warranty.clienteManual ?? "").toLowerCase().includes(q) ||
                (v.product?.name ?? v.warranty.referenciaManual ?? "").toLowerCase().includes(q)),
            );
            return (
              <>
                <p className="text-sm text-muted-foreground">{rows.length} {rows.length === 1 ? "garantía encontrada" : "garantías encontradas"}</p>
                {rows.length === 0 ? (
                  <EmptyState icon={History} title={t("warranty.emptyTitle")} description={t("warranty.emptyDescription")} />
                ) : (
                  <div className="space-y-3">
                    {agruparHistorial(rows).map((lote) => (
                      <LoteGarantias
                        key={lote.key}
                        lote={lote}
                        cerrado={!lotesAbiertos.has(lote.key)}
                        onToggle={() => toggleLoteAbierto(lote.key)}
                        renderCard={renderCard}
                        t={t}
                        mostrarOrigen={false}
                      />
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : null}

      {/* ============ BUSCAR IMEI ============ */}
      {tab === "buscar" ? (
        <section className="animate-fade-in space-y-3 rounded-lg border bg-card p-4 shadow-sm">
          <SerialScanInput
            stacked
            submitLabel={t("common.search")}
            onScan={buscarPorImei}
            hint={t("warranty.scanHint")}
          />
          {buscarResultado ? (
            (() => {
              const unit = findUnitBySerial(db, buscarResultado);
              const previo = unit ? undefined : buscarSerialPrevio(db, buscarResultado);
              const casos = unit
                ? vistas.filter((v) => v.warranty.unitId === unit.id)
                : vistas.filter(
                    (v) => v.warranty.imeiManual?.toLowerCase() === buscarResultado.toLowerCase(),
                  );
              const product = unit ? db.products.find((candidate) => candidate.id === unit.productId) : undefined;
              const origen = unit ? getUnitOrigen(db, unit) : undefined;
              return (
                <div className="space-y-3">
                  <p className="font-tabular text-sm font-semibold">{buscarResultado}</p>
                  {unit ? (
                    <div className="flex min-w-0 items-center gap-2">
                      <ProductThumbnail src={product?.imageUrl} alt={product?.name ?? "Referencia"} size="sm" />
                      <p className="text-sm text-muted-foreground">
                        {t("warranty.search.unit", {
                          producto: productoDeUnidad(unit),
                          estado: t(`unitStatus.${unit.status}`),
                        })}
                      </p>
                    </div>
                  ) : previo ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm text-muted-foreground">{t("warranty.search.previo")}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => usarComoPrevia(previo.serial)}
                      >
                        {t("warranty.usePrevia")}
                      </Button>
                    </div>
                  ) : null}
                  {origen && (origen.reception || origen.order) ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {origen.reception ? (
                        <span>
                          <span className="text-muted-foreground">{t("receptions.title")}: </span>
                          <CodeLink to={rutaDeRecepcion(origen.reception, unit?.serial)}>
                            {origen.reception.code}
                          </CodeLink>
                        </span>
                      ) : null}
                      {origen.order ? (
                        <span>
                          <span className="text-muted-foreground">{t("serialHistory.sale")}: </span>
                          <CodeLink to={`/pedidos/${origen.order.id}`}>{origen.order.code}</CodeLink>
                          {origen.customer ? (
                            <span className="text-muted-foreground"> · {origen.customer.name}</span>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {!unit && esCodigoInterno(buscarResultado) && casos[0] ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        imprimirEtiquetas([
                          {
                            producto: casos[0].warranty.referenciaManual || t("product.type"),
                            serial: buscarResultado,
                          },
                        ])
                      }
                    >
                      <Printer />
                      {t("warranty.printGeneratedLabel")}
                    </Button>
                  ) : null}
                  {casos.length === 0 ? (
                    <EmptyState
                      title={t(
                        unit || previo ? "warranty.noCasesForImei" : "warranty.search.notRegistered",
                      )}
                    />
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-2">{casos.map(renderCard)}</div>
                  )}
                </div>
              );
            })()
          ) : null}
        </section>
      ) : null}
    </div>
  );
};

export default Garantias;
