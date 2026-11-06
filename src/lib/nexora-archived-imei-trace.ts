/**
 * Traza histórica por IMEI exacto desde nexora_archive (función autenticada de solo lectura).
 * Nunca carga estas unidades dentro del store de inventario operativo.
 */
export interface ArchivedImeiMovement {
  id: string;
  occurredAt: string;
  type: string;
  referenceType: string | null;
  referenceId: string | null;
  quantity: string | null;
  notes: string | null;
}

export interface ArchivedImeiWarrantyEvent {
  id: string;
  status: string | null;
  notes: string | null;
  occurredAt: string;
}

export interface ArchivedImeiWarranty {
  id: string;
  code: string | null;
  status: string;
  reason: string | null;
  receivedAt: string | null;
  resolvedAt: string | null;
  originalSerial: string | null;
  replacementSerial: string | null;
  events: ArchivedImeiWarrantyEvent[];
}

export interface ArchivedImeiTrace {
  found: true;
  serial: string;
  source: "Techrez";
  readOnly: true;
  order: {
    sourceId: string;
    code: string;
    status: string;
    orderDate: string;
    deliveryDate: string | null;
    total: number;
  };
  customer: {
    name: string;
    phone: string | null;
  };
  product: {
    name: string;
    sku: string | null;
    category: string | null;
    imageUrl: string | null;
    imageSource: "exact_catalog_reference" | null;
  };
  unit: {
    sourceId: string;
    status: string | null;
    condition: string | null;
    color: string | null;
    receivedAt: string | null;
    assignedAt: string | null;
  };
  line: { sourceId: string; quantity: number; unitPrice: number };
  movements: ArchivedImeiMovement[];
  warranties: ArchivedImeiWarranty[];
}

export const parseArchivedImeiTrace = (value: unknown, searchedSerial: string): ArchivedImeiTrace | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("El servidor devolvió un historial de serial inválido.");
  }
  const payload = value as Record<string, unknown>;
  if (payload.found === false) return null;
  if (payload.found !== true || payload.readOnly !== true || payload.source !== "Techrez") {
    throw new Error("La consulta no corresponde al archivo histórico verificado.");
  }
  if (String(payload.serial ?? "").trim().toLowerCase() !== searchedSerial.trim().toLowerCase()) {
    throw new Error("El historial recibido no corresponde al serial buscado.");
  }
  if (!payload.order || !payload.product || !payload.customer || !payload.unit ||
      !Array.isArray(payload.movements) || !Array.isArray(payload.warranties)) {
    throw new Error("Faltan relaciones necesarias para mostrar el historial histórico.");
  }
  return value as ArchivedImeiTrace;
};

export async function getArchivedImeiTrace(serial: string): Promise<ArchivedImeiTrace | null> {
  const cleaned = serial.trim();
  if (cleaned.length < 5 || cleaned.length > 80) {
    throw new Error("Ingresa un serial completo para consultar su historial.");
  }

  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.rpc("nexora_historical_serial_trace", {
    p_serial: cleaned,
  });

  if (error) {
    throw new Error(error.message || "No fue posible consultar el historial del serial.");
  }
  return parseArchivedImeiTrace(data, cleaned);
}
