// @vitest-environment jsdom
import { useContext, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pullDb: vi.fn(),
  pushDb: vi.fn(),
  leerPerfil: vi.fn(),
  consultarPerfilSesion: vi.fn(),
  suscribirCambios: vi.fn(),
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  setAuth: vi.fn(),
  setAppCurrency: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/components/shared/busy-indicator", () => ({ BusyIndicator: () => null }));
vi.mock("@/components/shared/loading-screen", () => ({ LoadingScreen: () => null }));
vi.mock("@/lib/format", () => ({ APP_CURRENCY: "COP", setAppCurrency: mocks.setAppCurrency }));
vi.mock("@/lib/backend", () => ({
  detalleTecnico: (value: string) => value,
  consultarPerfilSesion: mocks.consultarPerfilSesion,
  leerPerfil: mocks.leerPerfil,
  pullDb: mocks.pullDb,
  pushDb: mocks.pushDb,
  suscribirCambios: mocks.suscribirCambios,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      getSession: mocks.getSession,
      signOut: mocks.signOut,
    },
    realtime: { setAuth: mocks.setAuth },
  },
}));

import { emptyDb } from "@/lib/db";
import { AppProvider } from "@/store/app-provider";
import { AppContext } from "@/store/contexts";

const session = { user: { id: "user-1", email: "admin@example.com" }, access_token: "token" };
const perfil = { id: "user-1", email: "admin@example.com", full_name: "Admin", role: "admin", is_active: true };

const Harness = () => {
  const app = useContext(AppContext);
  const [runError, setRunError] = useState("");
  if (!app) return null;
  return (
    <div>
      <div data-testid="user">{app.user?.id ?? ""}</div>
      <div data-testid="ready">{String(app.ready)}</div>
      <div data-testid="run-error">{runError}</div>
      <div data-testid="products">{app.db.products.map((product) => product.name).join(",")}</div>
      <button onClick={() => {
        void app.run((db) => {
          db.products.push({
            id: "optimistic-product", sku: "OPT-1", name: "optimistic",
            price: 10, cost: 5, minStock: 0, isActive: true,
            createdAt: "2026-10-24T00:00:00.000Z", updatedAt: "2026-10-24T00:00:00.000Z",
          });
        }).catch((error: unknown) => setRunError(error instanceof Error ? error.message : String(error)));
      }}>Guardar cambio</button>
    </div>
  );
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AppProvider · recuperación de resincronización", () => {
  it("reintenta al recuperar la conexión si falló la descarga posterior a un guardado fallido", async () => {
    const inicial = emptyDb();
    inicial.products.push({
      id: "initial-server-product", sku: "INITIAL-1", name: "initial-server",
      price: 5, cost: 2, minStock: 0, isActive: true,
      createdAt: "2026-10-24T00:00:00.000Z", updatedAt: "2026-10-24T00:00:00.000Z",
    });
    const autoritativa = emptyDb();
    autoritativa.products.push({
      id: "server-product", sku: "SERVER-1", name: "server-authoritative",
      price: 20, cost: 10, minStock: 0, isActive: true,
      createdAt: "2026-10-24T00:00:00.000Z", updatedAt: "2026-10-24T00:00:00.000Z",
    });

    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mocks.getSession.mockResolvedValue({ data: { session } });
    mocks.leerPerfil.mockResolvedValue(perfil);
    // The provider revalidates the active profile after login; an unconfigured mock
    // returns undefined and logs the test out, clearing dbRef before run() executes.
    mocks.consultarPerfilSesion.mockResolvedValue(perfil);
    mocks.suscribirCambios.mockReturnValue(vi.fn());
    mocks.setAuth.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.pushDb.mockRejectedValue(new Error("network unavailable"));
    let recoveryPulls = 0;
    mocks.pullDb.mockImplementation(async () => {
      // React StrictMode may run the session bootstrap more than once.
      // Keep every pre-save session load successful and target only recovery pulls.
      if (mocks.pushDb.mock.calls.length === 0) return inicial;
      recoveryPulls += 1;
      if (recoveryPulls === 1) throw new Error("network unavailable");
      return autoritativa;
    });

    render(<AppProvider><Harness /></AppProvider>);
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("user-1");
      expect(screen.getByTestId("ready").textContent).toBe("true");
      // "ready" only closes the auth bootstrap screen; wait for the loaded inventory itself.
      expect(screen.getByTestId("products").textContent).toContain("initial-server");
      expect(mocks.pullDb).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambio" }));
    await waitFor(() => {
      expect(
        mocks.pushDb.mock.calls.length === 1 || screen.getByTestId("run-error").textContent !== "",
      ).toBe(true);
    });
    await waitFor(() => {
      expect(screen.getByTestId("run-error").textContent).toBe("errors.saveFailed");
    });
    await waitFor(() => expect(mocks.pullDb).toHaveBeenCalledTimes(2));

    // The optimistic row must not be treated as confirmed after the save failed.
    fireEvent(window, new Event("online"));

    await waitFor(() => {
      expect(mocks.pullDb).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId("products").textContent).toContain("server-authoritative");
    });
    expect(screen.getByTestId("products").textContent).not.toContain("optimistic");
  });

  it("mantiene la sesión recuperable si falla temporalmente la consulta del perfil", async () => {
    const inicial = emptyDb();
    let consultasPerfil = 0;

    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    // Start offline from the auth bootstrap's point of view. This keeps the
    // scenario deterministic even when React replays effects in development/tests.
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.leerPerfil.mockResolvedValue(perfil);
    mocks.consultarPerfilSesion.mockImplementation(async () => {
      consultasPerfil += 1;
      if (consultasPerfil <= 4) throw new Error("network unavailable");
      return perfil;
    });
    mocks.suscribirCambios.mockReturnValue(vi.fn());
    mocks.setAuth.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.pullDb.mockResolvedValue(inicial);

    render(<AppProvider><Harness /></AppProvider>);

    await waitFor(() => {
      expect(mocks.consultarPerfilSesion).toHaveBeenCalledTimes(4);
      expect(screen.getByTestId("ready").textContent).toBe("true");
      expect(screen.getByTestId("user").textContent).toBe("");
    }, { timeout: 4000 });

    // Simulate a persisted session becoming readable again after connectivity returns.
    mocks.getSession.mockResolvedValue({ data: { session } });
    fireEvent(window, new Event("online"));

    // The profile endpoint is still unavailable: bootstrap must remain retryable
    // and must not sign the user out merely because the profile request failed.
    await waitFor(() => {
      expect(consultasPerfil).toBe(4);
      expect(screen.getByTestId("user").textContent).toBe("");
    }, { timeout: 4000 });
    expect(mocks.signOut).not.toHaveBeenCalled();

    // A subsequent online event simulates recovery of the profile endpoint.
    fireEvent(window, new Event("online"));

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("user-1");
      expect(mocks.pullDb).toHaveBeenCalled();
    }, { timeout: 4000 });

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(consultasPerfil).toBe(5);
  });
});
