import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  Boxes,
  ClipboardList,
  History,
  LayoutDashboard,
  PackagePlus,
  ScanLine,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Recorrido breve por las funciones actuales de la plataforma. */
const SECCIONES = [
  { key: "panel", icon: LayoutDashboard },
  { key: "recepcion", icon: PackagePlus },
  { key: "inventario", icon: Boxes },
  { key: "seriales", icon: ScanLine },
  { key: "pedidos", icon: ClipboardList },
  { key: "clientes", icon: Users },
  { key: "garantias", icon: ShieldCheck },
  { key: "historial", icon: History },
  { key: "avanzado", icon: Archive },
  { key: "admin", icon: Settings },
];

/**
 * Botón "Aprende a usar nuestra plataforma": abre la guía con las funciones.
 * `hero` se usa en la pantalla de acceso y `sidebar` dentro de la aplicación.
 */
export const PlatformGuide = ({ variant = "hero" }: { variant?: "hero" | "sidebar" }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant === "sidebar" ? "sidebar" : "outline"}
        onClick={() => setOpen(true)}
        className={cn(
          // transition-colors: la escala/sombra no se animan aquí para no chocar con las animaciones.
          "relative w-full justify-start transition-colors active:scale-100",
          variant === "hero" && "justify-center border-primary/40 bg-primary/5 hover:bg-primary/10",
        )}
      >
        {/* Onda suave alrededor del botón: solo opacity/transform, sin repintar sombras (no parpadea). */}
        {variant === "hero" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-1 animate-ring-out rounded-[inherit] border border-primary/60 will-change-transform motion-reduce:hidden"
          />
        ) : null}
        <Sparkles className="shrink-0 text-primary" />
        <span className="truncate font-medium">{t("guide.open")}</span>
        {/* Destello: contenedor propio con recorte, para no depender de overflow del botón. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] motion-reduce:hidden"
        >
          <span className="absolute inset-y-0 -left-1/3 w-1/3 animate-shine bg-gradient-to-r from-transparent via-primary/25 to-transparent will-change-transform" />
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("guide.title")}</DialogTitle>
            <DialogDescription>{t("guide.subtitle")}</DialogDescription>
          </DialogHeader>

          <ul className="max-h-[55vh] space-y-2.5 overflow-y-auto pr-1">
            {SECCIONES.map((seccion) => (
              <li key={seccion.key} className="flex gap-3 rounded-lg border bg-card p-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <seccion.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t(`guide.${seccion.key}.title`)}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t(`guide.${seccion.key}.text`)}
                  </p>
                </div>
              </li>
            ))}

            <li className="flex gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Wifi className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t("guide.realtime.title")}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("guide.realtime.text")}
                </p>
              </div>
            </li>
          </ul>

          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>
              {t("guide.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
