import type { QuickOrderSerialInput } from "./actions/orders-quick";
import { NEXT_SESSION_KEY, slotFromString, type NextSlot } from "./next-workspaces";

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export interface QuickOrderColorBatch {
  productId: string;
  condition: "nuevo" | "seminuevo";
  color: string;
  quantity: number;
  serials: string[];
}
export interface QuickOrderDraft {
  version: 1;
  customerId: string;
  serials: QuickOrderSerialInput[];
  pendingSerial?: string;
  colorBatch?: QuickOrderColorBatch;
}

export const emptyQuickOrderDraft = (): QuickOrderDraft => ({ version: 1, customerId: "", serials: [] });
export const quickOrderDraftKey = (userId: string, slot: NextSlot): string =>
  "nexora:quick-order-draft:v1:" + encodeURIComponent(userId) + ":next-" + slot;

export const currentQuickOrderDraftKey = (userId?: string): string | null => {
  if (!userId || typeof window === "undefined") return null;
  try {
    // AppLayout mounts the page only after claiming an exclusive Next workspace.
    const slot = slotFromString(window.sessionStorage.getItem(NEXT_SESSION_KEY));
    return slot ? quickOrderDraftKey(userId, slot) : null;
  } catch { return null; }
};

const storageFor = (storage?: DraftStorage) => storage ?? window.localStorage;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const readQuickOrderDraft = (key: string | null, storage?: DraftStorage): {
  draft: QuickOrderDraft; status: "empty" | "restored" | "unavailable";
} => {
  const empty = emptyQuickOrderDraft();
  if (!key) return { draft: empty, status: "unavailable" };
  try {
    const raw = storageFor(storage).getItem(key);
    if (!raw) return { draft: empty, status: "empty" };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || typeof parsed.customerId !== "string" || !Array.isArray(parsed.serials)) {
      return { draft: empty, status: "unavailable" };
    }
    const seen = new Set<string>();
    const serials: QuickOrderSerialInput[] = [];
    for (const entry of parsed.serials) {
      if (!isRecord(entry) || typeof entry.serial !== "string" || !entry.serial.trim() ||
          (entry.color !== undefined && typeof entry.color !== "string")) {
        return { draft: empty, status: "unavailable" };
      }
      const serial = entry.serial.trim();
      const normalized = serial.toLocaleLowerCase("es");
      if (seen.has(normalized)) return { draft: empty, status: "unavailable" };
      seen.add(normalized);
      serials.push({ serial, color: entry.color as string | undefined });
    }
    const pendingSerial = typeof parsed.pendingSerial === "string" && parsed.pendingSerial.trim() &&
      !seen.has(parsed.pendingSerial.trim().toLocaleLowerCase("es")) ? parsed.pendingSerial.trim() : undefined;
    const b = parsed.colorBatch;
    let colorBatch: QuickOrderColorBatch | undefined;
    if (isRecord(b) && typeof b.productId === "string" && (b.condition === "nuevo" || b.condition === "seminuevo") &&
        typeof b.color === "string" && b.color.trim() && typeof b.quantity === "number" &&
        Number.isSafeInteger(b.quantity) && b.quantity > 0 && Array.isArray(b.serials) &&
        b.serials.every((v) => typeof v === "string" && serials.some((entry) => entry.serial === v && entry.color === b.color)) &&
        new Set(b.serials).size === b.serials.length && b.serials.length < b.quantity && !pendingSerial) {
      colorBatch = { productId: b.productId, condition: b.condition, color: b.color, quantity: b.quantity, serials: b.serials as string[] };
    }
    return { draft: { version: 1, customerId: parsed.customerId, serials, pendingSerial, colorBatch }, status: "restored" };
  } catch { return { draft: empty, status: "unavailable" }; }
};

/** Synchronous write on every edit: no debounce, no server-side reservation. */
export const writeQuickOrderDraft = (key: string | null, draft: QuickOrderDraft, storage?: DraftStorage): boolean => {
  if (!key) return false;
  try {
    const target = storageFor(storage);
    if (!draft.customerId && !draft.serials.length && !draft.pendingSerial && !draft.colorBatch) target.removeItem(key);
    else target.setItem(key, JSON.stringify(draft));
    return true;
  } catch { return false; }
};

/** A successful confirmation must not erase a newer draft created while it was pending. */
export const clearConfirmedQuickOrderDraft = (key: string | null, confirmed: QuickOrderDraft, storage?: DraftStorage): boolean => {
  if (!key) return false;
  try {
    const target = storageFor(storage);
    const current = readQuickOrderDraft(key, target);
    if (current.status === "empty") return true;
    if (current.status !== "restored") return false;
    if (JSON.stringify(current.draft) !== JSON.stringify(confirmed)) return false;
    target.removeItem(key);
    return true;
  } catch { return false; }
};
