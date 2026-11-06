export interface HistoricalOrderListItem {
  sourceId: string;
  code: string;
  status: string;
  orderDate: string;
  total: number;
  customerName: string;
  lineCount: number;
  requestedUnits: number;
  assignedUnits?: number;
  serialCount: number;
  matchedSerial?: boolean;
}

export interface HistoricalSerial {
  serial: string;
  assignedAt: string | null;
  condition: string | null;
  originalStatus: string | null;
  receivedAt: string | null;
}

export interface HistoricalOrderLine {
  id: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  condition: string | null;
  color: string | null;
  serials: HistoricalSerial[];
}

export interface HistoricalMovement {
  id: string;
  serial: string | null;
  type: string;
  referenceType: string;
  referenceId: string | null;
  quantity: number;
  notes: string | null;
  createdAt: string;
}

export interface HistoricalWarrantyEvent {
  status: string | null;
  notes: string | null;
  createdAt: string;
}

export interface HistoricalWarranty {
  id: string;
  status: string;
  unitSerial: string | null;
  replacementUnitSerial: string | null;
  reason: string | null;
  diagnosis: string | null;
  resolution: string | null;
  notes: string | null;
  receivedAt: string | null;
  resolvedAt: string | null;
  events: HistoricalWarrantyEvent[];
}

export interface HistoricalAuditEntry {
  entity?: string;
  occurredAt: string;
  snapshot: Record<string, unknown>;
}

export interface HistoricalDocument {
  fileName: string;
  storagePath: string;
  metadata: Record<string, unknown>;
}

export interface HistoricalOrderDetail {
  order: {
    id: string;
    code: string;
    status: string;
    orderDate: string;
    deliveryDate: string | null;
    total: number;
    notes: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  customer: {
    name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    contactName: string | null;
    taxId: string | null;
  } | null;
  lines: HistoricalOrderLine[];
  movements: HistoricalMovement[];
  warranties: HistoricalWarranty[];
  audit: HistoricalAuditEntry[];
  relatedAudit: HistoricalAuditEntry[];
  documents: HistoricalDocument[];
  readOnly: true;
  source: string;
}

type HistoricalListPayload = {
  items?: unknown;
  total?: unknown;
};

export async function listHistoricalOrders(
  filters: { search?: string } = {},
): Promise<{
  items: HistoricalOrderListItem[];
  total: number;
}> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.rpc("nexora_historical_orders_list", {
    p_search: filters.search?.trim() || null,
    p_status: null,
  });

  if (error) {
    throw new Error(error.message || "No fue posible consultar el historial importado.");
  }

  const payload = (data ?? {}) as HistoricalListPayload;
  const items = Array.isArray(payload.items)
    ? (payload.items as Record<string, unknown>[]).map((item) => ({
        sourceId: String(item.sourceId ?? ""),
        code: String(item.code ?? "Pedido histórico"),
        status: String(item.status ?? "desconocido"),
        orderDate: String(item.orderDate ?? ""),
        total: Number(item.total ?? 0),
        customerName: String(item.customerName ?? "Cliente histórico"),
        lineCount: Number(item.lineCount ?? 0),
        requestedUnits: Number(item.requestedUnits ?? 0),
        assignedUnits: item.assignedUnits == null ? undefined : Number(item.assignedUnits),
        serialCount: Number(item.serialCount ?? 0),
        matchedSerial: item.matchedSerial === true,
      }))
    : [];

  return { items, total: Number(payload.total ?? items.length) };
}

export async function getHistoricalOrderDetail(
  sourceId: string,
): Promise<HistoricalOrderDetail> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.rpc("nexora_historical_order_detail", {
    p_source_id: sourceId,
  });

  if (error) {
    throw new Error(error.message || "No fue posible consultar el pedido histórico.");
  }

  if (!data || typeof data !== "object" || !("order" in data)) {
    throw new Error("El pedido no está disponible en el historial verificado.");
  }

  return data as unknown as HistoricalOrderDetail;
}

