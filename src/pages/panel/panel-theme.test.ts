import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

/**
 * CSS contract for Nexora's light/dark dashboard. These assertions prevent
 * legacy hard-coded white KPI cards from returning when the theme is dark.
 * Palette is selected by the html.dark class applied by next-themes.
 */
const source = readFileSync(new URL("./panel-premium.css", import.meta.url), "utf8");
const root = postcss.parse(source);
const rules: Array<{ selector: string; props: Record<string, string> }> = [];
root.walkRules((node) => {
  const props: Record<string, string> = {};
  node.walkDecls((declaration) => { props[declaration.prop] = declaration.value; });
  rules.push({ selector: node.selector, props });
});
const hasDeclaration = (part: string, property: string, token: string, dark: boolean) =>
  rules.some((rule) =>
    rule.selector.includes(part) &&
    (dark ? rule.selector.includes("html.dark") : !rule.selector.includes("html.dark") && !rule.selector.includes(".dark ")) &&
    (rule.props[property] ?? "").includes(token));

describe("colores sincronizados de Nexora Panel", () => {
  it("usa la misma clase html.dark que aplica next-themes y define ambas paletas", () => {
    expect(source).toContain("next-themes alterna html.dark");
    expect(hasDeclaration(".nx-dashboard-showcase.nx-dashboard-premium", "--nx-panel-card-base", "#ffffff", false)).toBe(true);
    expect(hasDeclaration(".nx-dashboard-showcase.nx-dashboard-premium", "--nx-panel-card-base", "hsl(var(--card))", true)).toBe(true);
    expect(hasDeclaration(".nx-dashboard-showcase.nx-dashboard-premium", "--nx-panel-text", "hsl(var(--foreground))", false)).toBe(true);
    expect(hasDeclaration(".nx-dashboard-showcase.nx-dashboard-premium", "--nx-panel-text", "hsl(var(--foreground))", true)).toBe(true);
  });

  it("las tarjetas del Resumen siguen fondo y tipografía del tema activo", () => {
    for (const selector of [
      ".nx-kpi-section .nx-premium-stat-card",
      ".nx-kpi-section .nx-wide-stat",
    ]) {
      expect(hasDeclaration(selector, "color", "var(--nx-panel-text)", false)).toBe(true);
      expect(hasDeclaration(selector, "background", "var(--nx-panel-card-base)", false)).toBe(true);
    }
    expect(hasDeclaration(".nx-premium-stat-card--info", "--nx-icon-bg", "#183c63", true)).toBe(true);
    expect(hasDeclaration(".nx-premium-stat-card--success", "--nx-icon-bg", "#103f39", true)).toBe(true);
    expect(hasDeclaration(".nx-premium-stat-card--warning", "--nx-icon-bg", "#50391b", true)).toBe(true);
    expect(hasDeclaration(".nx-premium-stat-card--primary", "--nx-icon-bg", "#28452b", true)).toBe(true);
  });

  it("las cuatro prioridades de garantía también cambian de paleta", () => {
    expect(hasDeclaration(".nx-warranty-kpi", "color", "var(--nx-panel-text)", false)).toBe(true);
    expect(hasDeclaration(".nx-warranty-kpi", "background", "var(--nx-panel-card-base)", false)).toBe(true);
    for (const tone of ["critical", "stalled", "pending", "service"]) {
      expect(hasDeclaration(".nx-warranty-kpi--" + tone, "--nx-kpi-wash", "#", true)).toBe(true);
    }
    expect(hasDeclaration(".nx-warranty-empty", "background", "var(--nx-panel-chart-surface)", false)).toBe(true);
  });

  it("conserva el esquema en los dos gráficos, ranking y rango de fechas", () => {
    for (const selector of [".nx-analytics-card", ".nx-ranking-card", ".nx-operation-card", ".nx-dashboard-report-filters"]) {
      expect(hasDeclaration(selector, "background", "var(--nx-panel-chart-surface)", false)).toBe(true);
    }
    expect(hasDeclaration(".nx-analytics-range", "background", "var(--nx-panel-surface)", false)).toBe(true);
    expect(source).not.toMatch(/\.nx-app-sidebar|\.nx-sidebar-nav|\.nx-sidebar-/);
  });
});
