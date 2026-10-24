import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

/** Alterna entre tema claro y oscuro con una animación circular desde el botón. */
export const ThemeToggle = () => {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  const handleClick = () => {
    const nextTheme = isDark ? "light" : "dark";
    const button = buttonRef.current;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Navegadores sin View Transitions API o con movimiento reducido: cambio directo.
    if (!button || prefersReducedMotion || !("startViewTransition" in document)) {
      setTheme(nextTheme);
      return;
    }

    // Origen del círculo: centro del botón.
    const { left, top, width, height } = button.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const transition = document.startViewTransition(() => {
      // flushSync asegura que la clase del <html> cambie antes de la captura.
      flushSync(() => setTheme(nextTheme));
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 600,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    });
  };

  return (
    <Button
      ref={buttonRef}
      variant="ghost"
      size="icon"
      className="relative h-11 w-11 overflow-hidden rounded-lg hover:bg-accent/80"
      aria-label={t("common.toggleTheme")}
      title={t("common.toggleTheme")}
      aria-pressed={isDark}
      onClick={handleClick}
    >
      <Sun
        className={`absolute transition-all duration-300 ease-out motion-reduce:transition-none ${
          isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
        }`}
      />
      <Moon
        className={`absolute transition-all duration-300 ease-out motion-reduce:transition-none ${
          isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
        }`}
      />
    </Button>
  );
};
