import { flushSync } from "react-dom";

/** Lo que expone document.startViewTransition, sin el "any" de sus tipos por defecto. */
type DocumentConTransicion = Document & {
  startViewTransition: (callback: () => void) => { ready: Promise<void> };
};

/**
 * Ejecuta `cambiar` con la misma animación de expansión circular que usa el interruptor de
 * tema: un círculo que crece desde el centro de `origen` hasta cubrir toda la pantalla.
 *
 * Si el navegador no soporta la View Transitions API, o la persona prefiere movimiento
 * reducido, `cambiar` se ejecuta directo, sin animación (nunca bloquea la acción real).
 */
export const conTransicionCircular = (origen: HTMLElement | null, cambiar: () => void): void => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!origen || prefersReducedMotion || !("startViewTransition" in document)) {
    cambiar();
    return;
  }

  const { left, top, width, height } = origen.getBoundingClientRect();
  const x = left + width / 2;
  const y = top + height / 2;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  const transition = (document as DocumentConTransicion).startViewTransition(() => {
    // flushSync asegura que el cambio ya se vea en el DOM antes de que se capture la "foto"
    // del estado nuevo para la animación.
    flushSync(cambiar);
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
