// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  read: vi.fn(async (_id: string) => {}),
  all: vi.fn(async () => {}),
  more: vi.fn(async () => {}),
  refresh: vi.fn(async () => {}),
}));
const inbox = vi.hoisted(() => ([
  {
    id: "n1", user_id: "staff", title: "Traslado TR-000123 en camino",
    message: "Se despachó una unidad", type: "transfer_dispatched",
    transfer_id: "transfer-123", site_id: "site", source_event_id: 15,
    read: false, created_at: "2026-11-05 10:00:00",
  },
  {
    id: "n2", user_id: "staff", title: "Traslado TR-000111 recibido",
    message: "Se confirmó la recepción", type: "transfer_received",
    transfer_id: "transfer-111", site_id: "site", source_event_id: 16,
    read: true, created_at: "2026-11-04 10:00:00",
  },
]));
vi.mock("@/components/layout/notifications-context", () => ({
  useNotifications: () => ({
    items: inbox, unread: 1, loading: false, loadingMore: false, hasMore: false,
    error: null, refresh: actions.refresh, loadMore: actions.more,
    markRead: actions.read, markAllRead: actions.all,
  }),
}));
import Notificaciones from "./index";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const mount = () => render(<MemoryRouter><Notificaciones /></MemoryRouter>);

describe("Centro de notificaciones Nexora", () => {
  it("muestra el historial, marca leído y abre el traslado enlazado", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Centro de notificaciones" })).toBeTruthy();
    const link = screen.getByRole("link", { name: /Traslado TR-000123 en camino/ });
    expect(link.getAttribute("href")).toBe("/traslados?transfer=transfer-123");
    fireEvent.click(screen.getByRole("button", { name: /Marcar como leída: Traslado TR-000123/ }));
    expect(actions.read).toHaveBeenCalledWith("n1");
    fireEvent.click(screen.getByRole("button", { name: "Marcar todas leídas" }));
    expect(actions.all).toHaveBeenCalledTimes(1);
  });

  it("permite ver solamente avisos sin leer", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Sin leer/ }));
    expect(screen.getByText("Traslado TR-000123 en camino")).toBeTruthy();
    expect(screen.queryByText("Traslado TR-000111 recibido")).toBeNull();
  });
});
