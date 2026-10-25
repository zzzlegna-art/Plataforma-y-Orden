import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  Boxes,
  BookOpen,
  ClipboardList,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  PackageCheck,
  PackagePlus,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wifi,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Guía breve, agrupada por el trabajo que el usuario quiere realizar. */
const GRUPOS = [
  {
    key: "operacion",
    items: [
      { key: "panel", icon: LayoutDashboard },
      { key: "catalogo", icon: FileSpreadsheet },
      { key: "recepcion", icon: PackagePlus },
      { key: "inventario", icon: Boxes },
      { key: "seriales", icon: ScanLine },
    ],
  },
  {
    key: "seguimiento",
    items: [
      { key: "pedidos", icon: ClipboardList },
      { key: "clientes", icon: Users },
      { key: "garantias", icon: ShieldCheck },
      { key: "historial", icon: History },
    ],
  },
  {
    key: "gestion",
    items: [
      { key: "ventasPrevias", icon: Archive },
      { key: "catalogos", icon: Boxes },
      { key: "liberar", icon: PackageCheck },
      { key: "admin", icon: Settings },
      { key: "movil", icon: Smartphone },
    ],
  },
] as const;

const TOTAL_TEMAS = GRUPOS.reduce((total, grupo) => total + grupo.items.length, 0);

/**
 * Guía de uso disponible tanto desde la pantalla de acceso como desde la navegación.
 * Incluye búsqueda para encontrar rápidamente un módulo o una tarea.
 */
export const PlatformGuide = ({ variant = "hero" }: { variant?: "hero" | "sidebar" }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const gruposFiltrados = useMemo(() => {
    const termino = query.trim().toLocaleLowerCase();
    return GRUPOS.map((grupo) => ({
      ...grupo,
      items: grupo.items.filter((item) => {
        if (!termino) return true;
        const titulo = t(`guide.${item.key}.title`).toLocaleLowerCase();
        const texto = t(`guide.${item.key}.text`).toLocaleLowerCase();
        return `${titulo} ${texto}`.includes(termino);
      }),
    })).filter((grupo) => grupo.items.length > 0);
  }, [query, t]);

  const resultados = gruposFiltrados.reduce((total, grupo) => total + grupo.items.length, 0);

  const cambiarApertura = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setQuery("");
  };

  return (
    <>
      <Button
        type="button"
        variant={variant === "sidebar" ? "sidebar" : "outline"}
        onClick={() => cambiarApertura(true)}
        className={cn(
          "relative w-full justify-start transition-colors active:scale-100",
          variant === "hero" && "justify-center border-primary/40 bg-primary/5 hover:bg-primary/10",
        )}
      >
        {variant === "hero" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-1 animate-ring-out rounded-[inherit] border border-primary/60 will-change-transform motion-reduce:hidden"
          />
        ) : null}
        <BookOpen className="shrink-0 text-primary" />
        <span className="truncate font-medium">{t("guide.open")}</span>
        {variant === "hero" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] motion-reduce:hidden"
          >
            <span className="absolute inset-y-0 -left-1/3 w-1/3 animate-shine bg-gradient-to-r from-transparent via-primary/25 to-transparent will-change-transform" />
          </span>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={cambiarApertura}>
        <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="relative shrink-0 overflow-hidden border-b bg-gradient-to-br from-primary/10 via-background to-background px-5 pb-5 pt-6 text-left sm:px-7 sm:pt-7">
            <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-background/80 text-primary shadow-sm">
                <BookOpen className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                  {t("guide.eyebrow")}
                </p>
                <DialogTitle className="text-xl font-semibold tracking-tight sm:text-2xl">
                  {t("guide.title")}
                </DialogTitle>
                <DialogDescription className="mt-1 max-w-2xl text-sm leading-relaxed">
                  {t("guide.subtitle")}
                </DialogDescription>
              </div>
              <span className="hidden shrink-0 rounded-full border bg-background/75 px-3 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
                {t("guide.count", { count: TOTAL_TEMAS })}
              </span>
            </div>
            <div className="relative mt-5">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={t("guide.searchLabel")}
                placeholder={t("guide.searchPlaceholder")}
                className="h-10 border-border/80 bg-background/90 pl-9 shadow-sm"
              />
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
            <div className="mb-5 flex gap-3 rounded-xl border border-primary/20 bg-primary/[0.045] p-3.5 sm:p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t("guide.catalogTip.title")}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("guide.catalogTip.text")}
                </p>
              </div>
            </div>

            {gruposFiltrados.length > 0 ? (
              <div className="space-y-6">
                {gruposFiltrados.map((grupo) => (
                  <section key={grupo.key} aria-labelledby={`guide-group-${grupo.key}`}>
                    <div className="mb-3 flex items-center gap-2">
                      <h3 id={`guide-group-${grupo.key}`} className="text-sm font-semibold">
                        {t(`guide.groups.${grupo.key}`)}
                      </h3>
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {grupo.items.length}
                      </span>
                    </div>
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {grupo.items.map((item) => (
                        <li
                          key={item.key}
                          className="group flex min-h-[126px] gap-3 rounded-xl border bg-card p-3.5 transition-colors hover:border-primary/35 hover:bg-accent/30"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                            <item.icon aria-hidden className="h-[18px] w-[18px]" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-snug">
                              {t(`guide.${item.key}.title`)}
                            </p>
                            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                              {t(`guide.${item.key}.text`)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-5 py-10 text-center">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Search className="h-5 w-5" />
                </span>
                <p className="text-sm font-semibold">{t("guide.noResults")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("guide.noResultsHint")}</p>
                <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => setQuery("")}>
                  {t("guide.clearSearch")}
                </Button>
              </div>
            )}

            <p className="mt-5 flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              <Wifi aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("guide.sync.text")}</span>
            </p>
          </div>

          <DialogFooter className="shrink-0 border-t bg-background px-5 py-3 sm:px-7">
            <span className="mr-auto hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <BookOpen className="h-3.5 w-3.5" />
              {t("guide.footer")}
            </span>
            <Button type="button" onClick={() => cambiarApertura(false)}>
              {t("guide.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
