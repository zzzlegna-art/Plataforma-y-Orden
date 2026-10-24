// @vitest-environment jsdom
import { useContext } from "react";
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
  if (!app) return null;
  return (
    <div>
      <div data-testid="user">{app.user?.id ?? ""}</div>
      <div data-testid="products">{app.db.products.map((product) => product.name).join(",")}</div>
      <button onClick={() => {
        void app.run((db) => {
          db.products.push({
            id: "optimistic-product", sku: "OPT-1", name: "optimistic",
            price: 10, cost: 5, minStock: 0, isActive: true,
            createdAt: "2026-10-24T00:00:00.000Z", updatedAt: "2026-10-24T00:00:00.000Z",
          });
        }).catch(() => undefined);
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
    const autoritativa = emptyDb();
    autoritativa.products.push({
      id: "server-product", sku: "SERVER-1", name: "server-authoritative",
      price: 20, cost: 10, minStock: 0, isActive: true,
      createdAt: "2026-10-24T00:00:00.000Z", updatedAt: "2026-10-24T00:00:00.000Z",
    });

    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mocks.getSession.mockResolvedValue({ data: { session } });
    mocks.leerPerfil.mockResolvedValue(perfil);
    mocks.suscribirCambios.mockReturnValue(vi.fn());
    mocks.setAuth.mockResolvedValue(undefined);
    mocks.pushDb.mockRejectedValue(new Error("network unavailable"));
    mocks.pullDb
      .mockResolvedValueOnce(inicial) // initial session load
      .mockRejectedValueOnce(new Error("network unavailable")) // resync after failed save
      .mockResolvedValueOnce(autoritativa); // retry after browser reports online

    render(<AppProvider><Harness /></AppProvider>);
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("user-1"));

    fireEvent.click(screen.getByRole("button", { name: "Guardar cambio" }));
    await waitFor(() => expect(mocks.pushDb).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.pullDb).toHaveBeenCalledTimes(2));

    // The optimistic row must not be treated as confirmed after the save failed.
    fireEvent(window, new Event("online"));

    await waitFor(() => {
      expect(mocks.pullDb).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId("products")).toHaveTextContent("server-authoritative");
    });
    expect(screen.getByTestId("products")).not.toHaveTextContent("optimistic");
  });
});
