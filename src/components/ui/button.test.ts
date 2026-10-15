import { describe, expect, it } from "vitest";

import { buttonVariants } from "./button";

describe("buttonVariants · sidebar", () => {
  const clases = buttonVariants({ variant: "sidebar" });

  it("usa los colores del menú lateral para fondo y texto", () => {
    expect(clases).toContain("bg-sidebar-accent");
    expect(clases).toContain("text-sidebar-foreground");
  });

  it("no mezcla el fondo claro del tema (bg-background) con el texto del menú (era el error)", () => {
    expect(clases).not.toMatch(/(^|\s)bg-background(\s|$)/);
  });

  it("'outline' no cambia: sigue siendo el botón claro de siempre", () => {
    expect(buttonVariants({ variant: "outline" })).toContain("bg-background");
  });
});
