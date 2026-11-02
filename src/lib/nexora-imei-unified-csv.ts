/**
 * Exportación de hoja de vida: combina el histórico anterior (movimientos,
 * garantías) con los hitos multisede comprobados para UN MISMO IMEI.
 * No modifica stock y no inventa eventos si falla alguna página.
 */
import type { UnitTimelineItem } from "./selectors";
import {
  fetchMultisiteImeiTimeline,
  type MultisiteImeiEvent,
  type MultisiteImeiTimeline,
} from "./nexora-imei-timeline";

export const MAX_MULTISITE_EVENTS_FOR_EXPORT = 2000;
type FetchPage = (unitId: string, page: number) => Promise<MultisiteImeiTimeline>;

/** Lee todas las páginas, verifica identidad, conteos y orden antes de exportar. */
export const collectMultisiteEventsForExport = async (
  unitId: string, serial: string, fetchPage: FetchPage = fetchMultisiteImeiTimeline,
): Promise<MultisiteImeiEvent[]> => {
  const first = await fetchPage(unitId, 1);
  if (first.unitId !== unitId || first.serial !== serial || first.page !== 1 ||
      first.pageSize !== 25 || first.total > MAX_MULTISITE_EVENTS_FOR_EXPORT) {
    throw new Error("No es posible exportar: el IMEI no coincide o el historial excede el límite seguro de 2.000 eventos.");
  }
  const events = [...first.items];
  const seen = new Set(events.map(event => event.eventId));
  if (seen.size !== events.length) throw new Error("El historial contiene eventos duplicados.");
  const pages = Math.max(1, Math.ceil(first.total / first.pageSize));
  for (let page = 2; page <= pages; page += 1) {
    const next = await fetchPage(unitId, page);
    if (next.unitId !== unitId || next.serial !== serial ||
        next.page !== page || next.total !== first.total ||
        next.pageSize !== first.pageSize || next.items.length === 0) {
      throw new Error("La hoja de vida cambió durante la exportación. Actualiza y vuelve a intentarlo.");
    }
    for (const event of next.items) {
      if (seen.has(event.eventId)) throw new Error("La hoja de vida contiene eventos repetidos entre páginas.");
      const prev = events[events.length - 1];
      if (prev && Date.parse(prev.eventAt) < Date.parse(event.eventAt)) {
        throw new Error("La hoja de vida contiene movimientos fuera de orden.");
      }
      seen.add(event.eventId);
      events.push(event);
    }
  }
  if (events.length !== first.total) {
    throw new Error("El historial no está completo. No se generó ningún archivo.");
  }
  return events;
};

const MULTISITE_LABELS: Record<MultisiteImeiEvent["eventType"], string> = {
  initial_approved: "Conciliación inicial aprobada",
  transfer_prepared: "Manifiesto de traslado",
  transfer_dispatched: "Despacho de traslado",
  transfer_received: "Recepción física confirmada",
  transfer_return_pending: "Retorno pendiente",
  transfer_returned: "Retorno físico verificado",
  transfer_cancelled: "Traslado cancelado",
  retail_sale: "Venta minorista",
};

/**
 * Protege contra inyección de fórmulas en hojas de cálculo, incluso si
 * una nota comienza con espacios, tabulaciones o un signo de operación.
 */
export const safeCsvCell = (input: string): string => {
  const flat = input.replace(/[\r\n\t]+/g, " ").trim();
  const escaped = /^[=+\-@]/.test(flat) ? "'" + flat : flat;
  return '"' + escaped.replace(/"/g, '""') + '"';
};

export const buildUnifiedImeiCsv = ({
  serial, receivedAt, legacy, multisite,
}: {
  serial: string;
  receivedAt: string;
  legacy: readonly UnitTimelineItem[];
  multisite: readonly MultisiteImeiEvent[];
}): string => {
  const rows = [
    ...legacy.map(item => ({
      time: item.fecha, origin: "Bodega / garantías", kind: item.tipo,
      description: item.descripcion, from: "", to: "",
      reference: item.enlace?.codigo ?? "", user: item.usuario ?? "",
      stableId: "legacy:" + item.id,
    })),
    ...multisite.map(item => ({
      time: item.eventAt, origin: "Multisede confirmada",
      kind: MULTISITE_LABELS[item.eventType], description: item.description,
      from: item.originSite ?? "", to: item.destinationSite ?? "",
      reference: item.reference ?? "", user: "",
      stableId: "multisite:" + item.eventId,
    })),
  ];
  // El sistema original mostraba su propia cronología sin mezclarse con la de multisede.
  // El archivo ordena ambas sin descartar eventos coincidentes de distinto origen.
  rows.sort((a,b)=>b.time.localeCompare(a.time)||a.stableId.localeCompare(b.stableId));
  const lines = [
    [ "Serial", "'" + serial ],
    [ "Ingreso original", receivedAt ],
    [ "Alcance", "Bodega y garantías + eventos multisede verificados" ],
    [],
    [ "Fecha", "Fuente", "Tipo", "Descripción", "Sede origen", "Sede destino", "Referencia", "Usuario" ],
    ...rows.map(r=>[r.time,r.origin,r.kind,r.description,r.from,r.to,r.reference,r.user]),
  ];
  return "\uFEFF" + lines.map(line=>line.map(value=>safeCsvCell(value)).join(";")).join("\r\n") + "\r\n";
};
