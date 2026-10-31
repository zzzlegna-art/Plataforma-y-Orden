// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/suppliers", () => ({
  listSuppliers: vi.fn(),
  setSupplierActive: vi.fn(),
}));
vi.mock("./SupplierQualityChart", () => ({ SupplierQualityChart: () => null }));
vi.mock("./SupplierFormDialog", () => ({
  SupplierFormDialog: ({ trigger, onSaved }: {
    trigger: ReactNode;
    onSaved?: () => void;
  }) => (
    <>
      {trigger}
      <button type="button" onClick={onSaved}>Simular guardado</button>
    </>
  ),
}));

import { listSuppliers, setSupplierActive, type Supplier } from "@/lib/suppliers";
import Proveedores from "./index";

const original: Supplier = { id: "supplier-1", name: "Proveedor inicial", isActive: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listSuppliers).mockResolvedValue([original]);
});
afterEach(cleanup);

describe("Proveedores · interacciones sin duplicados", () => {
  it("ignora un doble clic durante el cambio de estado y habilita el botón al terminar", async () => {
    let finish!: (value: Supplier) => void;
    vi.mocked(setSupplierActive).mockImplementationOnce(() => new Promise<Supplier>((resolve) => {
      finish = resolve;
    }));

    render(<Proveedores />);
    const button = await screen.findByRole("button", { name: "Desactivar" });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });

    expect(setSupplierActive).toHaveBeenCalledTimes(1);
    expect(setSupplierActive).toHaveBeenCalledWith(original, false);
    expect((screen.getByRole("button", { name: "Desactivar" }) as HTMLButtonElement).disabled).toBe(true);

    await act(async () => finish({ ...original, isActive: false }));
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Desactivar" }) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("descarta resultados antiguos cuando las recargas se completan en otro orden", async () => {
    render(<Proveedores />);
    await screen.findByText("Proveedor inicial");

    let resolveOld!: (value: Supplier[]) => void;
    let resolveNew!: (value: Supplier[]) => void;
    vi.mocked(listSuppliers)
      .mockImplementationOnce(() => new Promise<Supplier[]>((resolve) => { resolveOld = resolve; }))
      .mockImplementationOnce(() => new Promise<Supplier[]>((resolve) => { resolveNew = resolve; }));

    fireEvent.click(screen.getByRole("button", { name: "Actualizar proveedores" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Simular guardado" })[0]);

    await act(async () => resolveNew([{ ...original, name: "Proveedor actualizado" }]));
    expect(screen.getByText("Proveedor actualizado")).toBeTruthy();

    await act(async () => resolveOld([original]));
    expect(screen.getByText("Proveedor actualizado")).toBeTruthy();
    expect(screen.queryByText("Proveedor inicial")).toBeNull();
  });
});
