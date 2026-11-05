import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import {
  NEXT_CHANNEL, NEXT_SESSION_KEY, NEXT_SLOTS,
  claimNextWorkspace, occupiedNextSlots, preferredNextSlots,
  type NextClaim, type NextSlot, withNextSuffix,
} from "@/lib/next-workspaces";

type WorkspaceState = {
  slot: NextSlot | null;
  status: "loading" | "active" | "full";
  freeSlot: NextSlot | null;
  retry: () => void;
  openNext: () => void;
};

const makeOwner = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

/**
 * Al cerrar Next 2, el candado de Next 2 se libera incluso si Next 3 sigue abierto.
 * La propiedad es de la PESTAÑA (no del usuario ni de la URL escrita a mano).
 */
export const useNextWorkspace = (): WorkspaceState => {
  const location = useLocation();
  const [slot, setSlot] = useState<NextSlot | null>(null);
  const [status, setStatus] = useState<WorkspaceState["status"]>("loading");
  const [freeSlot, setFreeSlot] = useState<NextSlot | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let disposed = false;
    let busy = false;
    let claim: NextClaim | null = null;
    const owner = makeOwner();
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(NEXT_CHANNEL) : null;
    const notify = () => channel?.postMessage("updated");

    const refresh = async () => {
      const occupied = await occupiedNextSlots();
      if (!disposed) setFreeSlot(NEXT_SLOTS.find(candidate => !occupied.includes(candidate)) ?? null);
    };

    const register = async () => {
      if (disposed || busy || claim) return;
      busy = true;
      const preferred = (() => { try { return sessionStorage.getItem(NEXT_SESSION_KEY); } catch { return null; } })();
      const requested = new URL(window.location.href).searchParams.get("next");
      for (const candidate of preferredNextSlots(preferred, requested)) {
        const acquired = await claimNextWorkspace(candidate, owner);
        if (disposed) { acquired?.release(); break; }
        if (!acquired) continue;
        claim = acquired;
        setSlot(candidate);
        setStatus("active");
        try { sessionStorage.setItem(NEXT_SESSION_KEY, String(candidate)); } catch { /* Web Locks still owns the tab */ }
        window.name = "nexora-next-" + candidate;
        notify();
        break;
      }
      if (!disposed && !claim) { setSlot(null); setStatus("full"); }
      busy = false;
      void refresh();
    };

    const released = () => {
      if (!claim) return;
      claim.release();
      claim = null;
      notify();
    };
    const onChange = () => { void refresh(); if (!claim) void register(); };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) { released(); setStatus("loading"); void register(); }
    };
    window.addEventListener("pagehide", released);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("storage", onChange);
    if (channel) channel.onmessage = onChange;
    const timer = window.setInterval(() => {
      if (claim && !claim.renew()) {
        claim = null; setSlot(null); setStatus("loading"); void register();
      } else if (!claim) {
        void register();
      }
      void refresh();
    }, 3_000);
    void register();
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("pagehide", released);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("storage", onChange);
      released();
      channel?.close();
    };
  }, [retryCount]);

  // React Router puede reemplazar el query string en cada navegación; restaurar ?next=N
  // sin añadir una entrada al historial ni interferir con los filtros de las páginas.
  useEffect(() => {
    if (!slot || status !== "active") return;
    const current = new URL(window.location.href);
    if (current.searchParams.get("next") !== String(slot)) {
      window.history.replaceState(window.history.state, "", withNextSuffix(current.href, slot));
    }
    document.title = "Next " + slot + " · Nexora";
  }, [location.pathname, location.search, location.hash, slot, status]);

  const retry = useCallback(() => setRetryCount(count => count + 1), []);
  const openNext = useCallback(() => {
    if (!freeSlot) return;
    // Nombre de ventana estable: puede enfocarla/reutilizarla si el navegador lo permite.
    const url = withNextSuffix(window.location.origin + "/panel", freeSlot);
    const tab = window.open(url, "nexora-next-" + freeSlot);
    tab?.focus();
  }, [freeSlot]);

  return { slot, status, freeSlot, retry, openNext };
};
