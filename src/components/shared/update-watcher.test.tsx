// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { UpdateWatcher } from "./update-watcher";

const SCRIPT_ACTUAL = "/assets/index-actual.js";

const prepararScript = (src = SCRIPT_ACTUAL) => {
  const script = document.createElement("script");
  script.src = src;
  document.body.appendChild(script);
};

beforeEach(() => {
  toastMock.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<script type="module" src="/assets/index-actual.js"></script>',
    }),
  );
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("UpdateWatcher · versiones publicadas", () => {
  it("avisa una sola vez cuando el servidor publica un bundle distinto", async () => {
    prepararScript();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => '<script type="module" src="/assets/index-nuevo.js"></script>',
    } as Response);

    render(<UpdateWatcher />);

    await waitFor(() => expect(toastMock).toHaveBeenCalledOnce());
    expect(toastMock).toHaveBeenCalledWith(
      "update.available",
      expect.objectContaining({
        id: "actualizacion",
        description: "update.hint",
        duration: Infinity,
        action: expect.objectContaining({ label: "update.reload", onClick: expect.any(Function) }),
      }),
    );
  });

  it("no muestra aviso si la versión cargada ya es la publicada", async () => {
    prepararScript();
    render(<UpdateWatcher />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/index.html", { cache: "no-store" }));
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("no consulta versiones en desarrollo cuando no hay bundle con hash", () => {
    render(<UpdateWatcher />);

    expect(fetch).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });
  it("vuelve a comprobar al regresar a la pestaña si la primera consulta falló", async () => {
    prepararScript();
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<script type="module" src="/assets/index-nuevo.js"></script>',
      } as Response);

    render(<UpdateWatcher />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(toastMock).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("no duplica el aviso cuando varias comprobaciones detectan la misma versión", async () => {
    prepararScript();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => '<script type="module" src="/assets/index-nuevo.js"></script>',
    } as Response);

    render(<UpdateWatcher />);

    await waitFor(() => expect(toastMock).toHaveBeenCalledOnce());
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledOnce();
    expect(toastMock).toHaveBeenCalledOnce();
  });

});
