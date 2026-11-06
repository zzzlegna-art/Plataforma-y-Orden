export interface DashboardOrderRankEntry {
  key: string;
  name: string;
  units: number;
  ordersCount: number;
}

export interface DashboardOrderRankings {
  totalOrders: number;
  consideredOrders: number;
  cancelledOrders: number;
  operationalOrders: number;
  historicalOrders: number;
  products: DashboardOrderRankEntry[];
  customers: DashboardOrderRankEntry[];
}

const toCount = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const parseEntries = (value: unknown): DashboardOrderRankEntry[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row): DashboardOrderRankEntry[] => {
    if (!row || typeof row !== "object") return [];
    const item = row as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const key = typeof item.key === "string" ? item.key : name.toLocaleLowerCase("es");
    if (!name || !key) return [];
    return [{
      key,
      name,
      units: toCount(item.units ?? item.value),
      ordersCount: toCount(item.ordersCount),
    }];
  });
};

export const parseDashboardOrderRankings = (value: unknown): DashboardOrderRankings => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("La respuesta de rankings de pedidos no tiene un formato válido.");
  }

  const payload = value as Record<string, unknown>;
  return {
    totalOrders: toCount(payload.totalOrders),
    consideredOrders: toCount(payload.consideredOrders),
    cancelledOrders: toCount(payload.cancelledOrders),
    operationalOrders: toCount(payload.operationalOrders),
    historicalOrders: toCount(payload.historicalOrders),
    products: parseEntries(payload.products),
    customers: parseEntries(payload.customers),
  };
};

export async function getDashboardOrderRankings(): Promise<DashboardOrderRankings> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.rpc("nexora_dashboard_order_rankings");

  if (error) {
    throw new Error(error.message || "No fue posible cargar los rankings de pedidos.");
  }

  return parseDashboardOrderRankings(data);
}
