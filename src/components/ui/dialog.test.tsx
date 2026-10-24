// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "./alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

afterEach(cleanup);

describe("modales · superficie visual compartida", () => {
  it("el diálogo usa colores semánticos, borde y radio consistentes en ambos temas", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Configuración</DialogTitle>
          <DialogDescription>Preferencias de la aplicación.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    const content = screen.getByRole("dialog");
    expect(content.className).toContain("bg-card");
    expect(content.className).toContain("border-border/80");
    expect(content.className).toContain("rounded-2xl");
    expect(content.className).toContain("max-sm:rounded-t-2xl");
  });

  it("el diálogo de confirmación comparte la misma superficie y adaptación móvil", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>¿Confirmar?</AlertDialogTitle>
          <AlertDialogDescription>Confirma esta acción de prueba.</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    );

    const content = screen.getByRole("alertdialog");
    expect(content.className).toContain("bg-card");
    expect(content.className).toContain("border-border/80");
    expect(content.className).toContain("rounded-2xl");
    expect(content.className).toContain("max-sm:rounded-t-2xl");
  });
});
