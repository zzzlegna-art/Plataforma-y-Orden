import { describe, expect, it } from "vitest";

import { toastVariants } from "./toast";

describe("toastVariants · notificaciones coherentes con el tema", () => {
  it("usa la misma superficie, borde y radio en el aviso normal", () => {
    const classes = toastVariants({ variant: "default" });
    expect(classes).toContain("rounded-xl");
    expect(classes).toContain("border-border/80");
    expect(classes).toContain("bg-card/95");
    expect(classes).toContain("text-card-foreground");
    expect(classes).toContain("shadow-xl");
  });

  it("marca los errores con acento semántico sin invertir todo el fondo a rojo", () => {
    const classes = toastVariants({ variant: "destructive" });
    expect(classes).toContain("border-l-destructive");
    expect(classes).toContain("bg-card/95");
    expect(classes).not.toContain("bg-destructive");
  });
});
