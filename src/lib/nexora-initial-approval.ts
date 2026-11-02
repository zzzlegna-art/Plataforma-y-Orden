/**
 * Nexora Multisede 2.0 — acta única del inventario inicial.
 * La aprobación no cambia las operaciones legacy; registra ubicación y
 * costo histórico por IMEI en una foto inmutable protegida por el servidor.
 */
export interface InitialInventoryProgress {
  total: number;
  verified: number;
  pending: number;
  stale: number;
  approved: number;
  approvedAt: string | null;
  isApproved: boolean;
  ready: boolean;
}

export interface InitialInventoryApprovalResult {
  approvalId: string;
  approvedCount: number;
  approvedAt: string;
}

export const getInitialApprovalBlocker = (
  progress: InitialInventoryProgress,
): string | null => {
  if (progress.isApproved) return "El inventario inicial ya está aprobado.";
  if (progress.total <= 0) return "No hay unidades físicas para conciliar.";
  if (progress.stale > 0) return "Existen verificaciones vencidas: revisa estado y sede del IMEI.";
  if (progress.pending > 0) return "Hay unidades físicas pendientes de cotejo por IMEI.";
  if (progress.verified !== progress.total) return "El conteo no coincide con el inventario.";
  return null;
};

export const canApproveInitialInventory = (
  progress: InitialInventoryProgress | null,
  acknowledgment: boolean,
  token: string,
): boolean => Boolean(
  progress && !getInitialApprovalBlocker(progress) &&
  progress.ready && acknowledgment && token.trim() === "APROBAR",
);

const finiteCount = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("Supabase devolvió un conteo de inventario inválido.");
  }
  return value;
};

export const parseInitialInventoryProgress = (payload: unknown): InitialInventoryProgress => {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("No se pudo leer el estado de aprobación de Nexora.");
  }
  const p = payload as Record<string, unknown>;
  const total = finiteCount(p.total);
  const verified = finiteCount(p.verified);
  const pending = finiteCount(p.pending);
  const stale = finiteCount(p.stale);
  const approved = finiteCount(p.approved);
  const approvedAt = typeof p.approvedAt === "string" ? p.approvedAt : null;
  if (typeof p.isApproved !== "boolean" || typeof p.ready !== "boolean") {
    throw new Error("Estado de aprobación incompleto.");
  }
  return { total, verified, pending, stale, approved, approvedAt,
    isApproved: p.isApproved, ready: p.ready };
};

type Result = { data: unknown; error: { message: string } | null };
const rpc = async (name: string): Promise<Result> => {
  const { supabase } = await import("@/integrations/supabase/client");
  return (supabase as unknown as { rpc: (fn: string) => Promise<Result> }).rpc(name);
};

export const getInitialInventoryProgress = async (): Promise<InitialInventoryProgress> => {
  const { data, error } = await rpc("nexora_initial_inventory_progress");
  if (error) throw new Error(error.message);
  return parseInitialInventoryProgress(data);
};

/**
 * Operación atómica con validación completa en PostgreSQL.
 * La UI es una segunda capa; el servidor no acepta aprobaciones parciales.
 */
export const approveInitialInventory = async (): Promise<InitialInventoryApprovalResult> => {
  const { data, error } = await rpc("nexora_approve_initial_inventory");
  if (error) throw new Error(error.message);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("No fue posible validar el acta de aprobación.");
  }
  const d = data as Record<string, unknown>;
  if (typeof d.approvalId !== "string" || typeof d.approvedAt !== "string") {
    throw new Error("El servidor no confirmó los datos del acta.");
  }
  return {
    approvalId: d.approvalId,
    approvedAt: d.approvedAt,
    approvedCount: finiteCount(d.approvedCount),
  };
};
