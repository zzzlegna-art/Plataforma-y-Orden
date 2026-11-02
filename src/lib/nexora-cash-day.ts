/**
 * Nexora Multisede 2.0 · caja diaria por local.
 * Fechas según America/Bogota, pagos retail separados de pedidos mayoristas.
 * El servidor deniega movimientos antes de la activación real del Encargado.
 */
export type CashState = "not_opened" | "open" | "closed";

export interface CashStoreDay {
  siteId: string;
  siteName: string;
  sessionId: string | null;
  state: CashState;
  openingCash: number;
  expenses: number;
  salesCash: number;
  salesTransfer: number;
  expectedCash: number;
  closingCountedCash: number | null;
  closingDifference: number | null;
  openedAt: string | null;
  closedAt: string | null;
  managerEnabled: boolean;
}
export interface CashDayReport {
  businessDate: string;
  timezone: string;
  initialApproved: boolean;
  stores: CashStoreDay[];
}
export interface CashOperationResponse {
  sessionId: string;
  state: "open" | "closed";
  date?: string;
  reopened?: boolean;
  expected?: number;
  counted?: number;
  difference?: number;
  expenseRegistered?: number;
}
export type CashOperation = "open" | "expense" | "close" | "reopen";

export const CASH_STATE_LABEL: Record<CashState,string> = {
  not_opened: "Sin apertura",
  open: "Abierta",
  closed: "Cerrada",
};

export const validateCashOperation = (
  action: CashOperation, value: number | null, note: string,
): string | null => {
  if (action === "reopen") return note.trim().length >= 5
    ? null : "Escribe el motivo de reapertura (mínimo 5 caracteres).";
  if (value === null || !Number.isFinite(value) || value < 0 || value > 99999999999999.99)
    return "Introduce un monto válido no negativo.";
  if (Math.round(value*100)/100 !== value)
    return "Utiliza máximo dos decimales.";
  if (action === "expense" && value === 0)
    return "El gasto debe ser mayor que cero.";
  if (action === "expense" && (note.trim().length < 5 || note.length > 500))
    return "Describe el gasto entre 5 y 500 caracteres.";
  return null;
};

const record = (data: unknown): Record<string,unknown> => {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("La respuesta de caja no tiene formato válido.");
  return data as Record<string,unknown>;
};
const nonnegative = (v: unknown): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0)
    throw new Error("Importe inválido en el reporte de caja.");
  return v;
};
const optionalAmount = (v: unknown): number | null =>
  v === null ? null : typeof v === "number" && Number.isFinite(v) ? v
    : (() => { throw new Error("Diferencia de cierre inválida."); })();
const nullableString = (v: unknown): string | null =>
  typeof v === "string" ? v : v === null ? null
    : (() => { throw new Error("Fecha o sesión de caja inválida."); })();

export const parseCashDayReport = (raw: unknown): CashDayReport => {
  const data = record(raw);
  if (typeof data.businessDate !== "string" || data.timezone !== "America/Bogota" ||
    typeof data.initialApproved !== "boolean" || !Array.isArray(data.stores))
    throw new Error("Falta información crítica de caja.");
  return {
    businessDate: data.businessDate, timezone: data.timezone,
    initialApproved: data.initialApproved,
    stores: data.stores.map((value: unknown) => {
      const r = record(value);
      if (typeof r.siteId !== "string" || typeof r.siteName !== "string" ||
          !["open","closed","not_opened"].includes(String(r.state)) ||
          typeof r.managerEnabled !== "boolean") throw new Error("Local de caja inválido.");
      return {
        siteId:r.siteId, siteName:r.siteName,
        sessionId: nullableString(r.sessionId), state:r.state as CashState,
        openingCash:nonnegative(r.openingCash), expenses:nonnegative(r.expenses),
        salesCash:nonnegative(r.salesCash), salesTransfer:nonnegative(r.salesTransfer),
        expectedCash: typeof r.expectedCash === "number" && Number.isFinite(r.expectedCash)
          ? r.expectedCash : (() => { throw new Error("Efectivo esperado inválido."); })(),
        closingCountedCash: optionalAmount(r.closingCountedCash),
        closingDifference: optionalAmount(r.closingDifference),
        openedAt: nullableString(r.openedAt),closedAt:nullableString(r.closedAt),
        managerEnabled:r.managerEnabled,
      };
    }),
  };
};

const rpc = async (name: string,args: Record<string,unknown>): Promise<unknown> => {
  const { supabase } = await import("@/integrations/supabase/client");
  const result = await (supabase as unknown as {
    rpc: (method: string,values: Record<string,unknown>) => Promise<{
      data: unknown; error: {message: string}|null
    }>
  }).rpc(name,args);
  if (result.error) throw new Error(result.error.message);
  return result.data;
};

export const getCashDayReport = async (businessDate?: string): Promise<CashDayReport> =>
  parseCashDayReport(await rpc("nexora_cash_day_report", {
    p_business_date:businessDate||null,
  }));

export const runCashOperation = async (
  action: CashOperation,siteId: string,amount: number|null,note: string,
): Promise<CashOperationResponse> => {
  const validation = validateCashOperation(action,amount,note);
  if (validation) throw new Error(validation);
  if (!siteId) throw new Error("Selecciona un local.");
  const result = record(await rpc("nexora_cash_operation",{
    p_action:action,p_site_id:siteId,p_amount:amount,p_note:note.trim()||null,
  }));
  if (typeof result.sessionId !== "string" || !["open","closed"].includes(String(result.state)))
    throw new Error("No fue posible validar el registro de caja.");
  return result as unknown as CashOperationResponse;
};
