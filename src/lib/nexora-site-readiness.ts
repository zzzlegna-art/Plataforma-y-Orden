/**
 * Disponibilidad por sede · Nexora Multisede 2.0
 * Indicadores de lectura. No habilitan ventas, precios ni reservas del POS.
 * La fuente autoritativa es PostgreSQL: pedidos, custodia e inventario.
 */
export interface SiteReadiness {
  siteId: string;
  siteName: string;
  siteType: string;
  physical: number;
  reserved: number;
  candidate: number;
  restricted: number;
}
export interface GlobalSiteReadiness {
  approved: boolean;
  sites: SiteReadiness[];
  inTransit: number;
  returnPending: number;
  unmapped: number;
}
export interface ProductReadiness {
  productId: string | null;
  productName: string;
  candidate: number;
  reserved: number;
  restricted: number;
}

const count = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Nexora recibió un conteo de inventario inválido.");
  return value;
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("El servidor devolvió un inventario inválido.");
  return value as Record<string, unknown>;
};

export const parseReadiness = (payload: unknown): GlobalSiteReadiness => {
  const row = object(payload);
  if (typeof row.approved !== "boolean" || !Array.isArray(row.sites))
    throw new Error("Faltan los permisos o datos de inventario por sede.");
  return {
    approved: row.approved,
    inTransit: count(row.inTransit),
    returnPending: count(row.returnPending),
    unmapped: count(row.unmapped),
    sites: row.sites.map((item: unknown) => {
      const r = object(item);
      if (typeof r.siteId !== "string" || typeof r.siteName !== "string" ||
          typeof r.siteType !== "string")
        throw new Error("Una sede no tiene identificación válida.");
      return {
        siteId: r.siteId, siteName: r.siteName, siteType: r.siteType,
        physical: count(r.physical), candidate: count(r.candidate),
        reserved: count(r.reserved), restricted: count(r.restricted),
      };
    }),
  };
};
export const parseProductReadiness = (payload: unknown): ProductReadiness[] => {
  if (!Array.isArray(payload)) throw new Error("No fue posible leer los productos de la sede.");
  return payload.map((item: unknown) => {
    const r = object(item);
    if (typeof r.productName !== "string" || !(r.productId === null || typeof r.productId === "string"))
      throw new Error("Referencia inválida en el inventario por sede.");
    return {
      productId: r.productId,
      productName: r.productName,
      candidate: count(r.candidate),
      reserved: count(r.reserved),
      restricted: count(r.restricted),
    };
  }).sort((a,b) => new Intl.Collator("es-CO", {
    numeric: true, sensitivity: "base",
  }).compare(a.productName,b.productName));
};

const query = async (name: string, args?: Record<string, unknown>): Promise<unknown> => {
  const { supabase } = await import("@/integrations/supabase/client");
  const client = supabase as unknown as {
    rpc: (name: string, args?: Record<string, unknown>) => Promise<{
      data: unknown; error: { message: string } | null
    }>;
  };
  const result = await client.rpc(name, args);
  if (result.error) throw new Error(result.error.message);
  return result.data;
};

export const fetchSiteReadiness = async (): Promise<GlobalSiteReadiness> =>
  parseReadiness(await query("nexora_site_commercial_readiness"));

export const fetchProductReadiness = async (siteId: string): Promise<ProductReadiness[]> => {
  if (!siteId) return [];
  return parseProductReadiness(
    await query("nexora_site_product_readiness", { p_site_id: siteId }),
  );
};
