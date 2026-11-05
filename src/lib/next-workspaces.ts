/**
 * Espacios Next 1/2/3: una identidad de navegación por pestaña.
 * Solo coordina el navegador; nunca es un permiso ni una sesión adicional.
 * Web Locks garantiza propiedad exclusiva en navegadores compatibles.
 */
export type NextSlot = 1 | 2 | 3;
export const NEXT_SLOTS: readonly NextSlot[] = [1, 2, 3];
export const NEXT_SESSION_KEY = "nexora:workspace:slot:v1";
export const NEXT_CHANNEL = "nexora:workspace:changed:v1";
export const NEXT_LOCK_PREFIX = "nexora:workspace:lock:v1:";
const FALLBACK_PREFIX = "nexora:workspace:lease:v1:";
const FALLBACK_TTL_MS = 12_000;

export const isNextSlot = (value: unknown): value is NextSlot =>
  value === 1 || value === 2 || value === 3;

export const slotFromString = (value: string | null | undefined): NextSlot | null => {
  const number = Number(value);
  return value != null && isNextSlot(number) ? number : null;
};

/** Al recargar se conserva el Next anterior; al duplicar una pestaña, otro Next libre gana. */
export const preferredNextSlots = (session: string | null, url: string | null): NextSlot[] => {
  const preferred = slotFromString(session) ?? slotFromString(url);
  return preferred == null ? [...NEXT_SLOTS] : [preferred, ...NEXT_SLOTS.filter(slot => slot !== preferred)];
};

/** Preserva la ruta, los filtros y #hash originales. */
export const withNextSuffix = (url: string, slot: NextSlot): string => {
  const parsed = new URL(url, "https://nexora.local");
  parsed.searchParams.set("next", String(slot));
  return parsed.pathname + parsed.search + parsed.hash;
};

type FallbackLease = { owner: string; touched: number };
const leaseKey = (slot: NextSlot) => FALLBACK_PREFIX + slot;

const readLease = (slot: NextSlot): FallbackLease | null => {
  try {
    const text = localStorage.getItem(leaseKey(slot));
    if (!text) return null;
    const candidate: unknown = JSON.parse(text);
    if (!candidate || typeof candidate !== "object") return null;
    const lease = candidate as Record<string, unknown>;
    return typeof lease.owner === "string" && typeof lease.touched === "number"
      && Number.isFinite(lease.touched) ? { owner: lease.owner, touched: lease.touched } : null;
  } catch {
    return null;
  }
};

export interface NextClaim {
  slot: NextSlot;
  release: () => void;
  renew: () => boolean;
}

const tryWebLock = async (slot: NextSlot): Promise<NextClaim | null> => {
  // La solicitud no se espera al finalizar: mantener viva la promesa retiene el lock.
  let resolveAttempt!: (value: NextClaim | null) => void;
  const attempted = new Promise<NextClaim | null>(resolve => { resolveAttempt = resolve; });
  let reported = false;
  const report = (value: NextClaim | null) => {
    if (!reported) { reported = true; resolveAttempt(value); }
  };
  void navigator.locks.request(NEXT_LOCK_PREFIX + slot, { ifAvailable: true }, async lock => {
    if (!lock) { report(null); return; }
    await new Promise<void>(release => {
      let closed = false;
      report({
        slot,
        release: () => { if (!closed) { closed = true; release(); } },
        renew: () => true,
      });
    });
  }).catch(() => report(null));
  return attempted;
};

const tryFallbackLease = async (slot: NextSlot, owner: string): Promise<NextClaim | null> => {
  const existing = readLease(slot);
  if (existing && existing.owner !== owner && Date.now() - existing.touched < FALLBACK_TTL_MS) return null;
  try {
    localStorage.setItem(leaseKey(slot), JSON.stringify({ owner, touched: Date.now() }));
    // A second tab could race a fallback write. Check ownership after yielding.
    await new Promise<void>(resolve => { window.setTimeout(resolve, 50); });
    if (readLease(slot)?.owner !== owner) return null;
    return {
      slot,
      release: () => {
        if (readLease(slot)?.owner === owner) localStorage.removeItem(leaseKey(slot));
      },
      renew: () => {
        if (readLease(slot)?.owner !== owner) return false;
        localStorage.setItem(leaseKey(slot), JSON.stringify({ owner, touched: Date.now() }));
        return true;
      },
    };
  } catch {
    return null;
  }
};

const webLocksSupported = (): boolean =>
  typeof navigator !== "undefined" && typeof navigator.locks?.request === "function"
  && typeof navigator.locks?.query === "function";

export const claimNextWorkspace = async (slot: NextSlot, owner: string): Promise<NextClaim | null> =>
  webLocksSupported() ? tryWebLock(slot) : tryFallbackLease(slot, owner);

/** Posiciones visibles para abrir otra pestaña, sin compartir ni guardar datos comerciales. */
export const occupiedNextSlots = async (): Promise<NextSlot[]> => {
  if (webLocksSupported()) {
    try {
      const snapshot = await navigator.locks.query();
      return NEXT_SLOTS.filter(slot => snapshot.held?.some(lock => lock.name === NEXT_LOCK_PREFIX + slot));
    } catch {
      // Una lectura fallida no autoriza abrir un cuarto espacio: usar respaldo.
    }
  }
  return NEXT_SLOTS.filter(slot => {
    const lease = readLease(slot);
    return lease !== null && Date.now() - lease.touched < FALLBACK_TTL_MS;
  });
};
