// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, params?: { serial?: string }) => params?.serial ? `${key} ${params.serial}` : key }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";
import { CopySerialButton } from "./copy-serial-button";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CopySerialButton", () => {
  it("copia únicamente el IMEI de su propia fila y no abre la ficha", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const openDetails = vi.fn();

    render(
      <div onClick={openDetails}>
        <CopySerialButton serial="000000006868527" />
        <CopySerialButton serial="00000000936298" />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "unit.copySerial 00000000936298" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("00000000936298"));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(openDetails).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("unit.serialCopied");
  });

  it("informa al usuario cuando el portapapeles falla", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Clipboard denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    render(<CopySerialButton serial="000000006868527" />);
    fireEvent.click(screen.getByRole("button", { name: "unit.copySerial 000000006868527" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("unit.copySerialsError"));
  });
});
