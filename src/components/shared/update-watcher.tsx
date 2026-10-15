import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/** Cada cuánto se revisa si hay una versión nueva mientras la app está abierta. */
const INTERVALO_REVISION_MS = 5 * 60 * 1000;
/** Si la app estuvo oculta al menos este tiempo, al volver se actualiza sola. */
const AUSENCIA_PARA_RECARGA_MS = 5 * 60 * 1000;

const PATRON_SCRIPT = /\/assets\/index-[^"'\s]+\.js/;

/** Archivo principal que está ejecutando esta pestaña (null en desarrollo). */
const scriptCargado = () => {
  const rutas = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]")).map(
    (script) => new URL(script.src, window.location.href).pathname,
  );
  return rutas.find((ruta) => PATRON_SCRIPT.test(ruta)) ?? null;
};

/** Archivo principal de la versión publicada en el servidor. */
const scriptPublicado = async () => {
  const respuesta = await fetch("/index.html", { cache: "no-store" });
  if (!respuesta.ok) return null;
  const html = await respuesta.text();
  return PATRON_SCRIPT.exec(html)?.[0] ?? null;
};

/**
 * La app instalada (sobre todo en escritorio) puede quedar abierta días con una versión
 * vieja: el navegador no recarga solo. Este observador compara la versión que se está
 * ejecutando con la publicada y:
 *  - avisa con un botón "Actualizar" cuando hay una versión nueva, y
 *  - si la app estuvo un rato en segundo plano, se actualiza sola al volver.
 */
export const UpdateWatcher = () => {
  const { t } = useTranslation();
  const versionActual = useRef<string | null>(null);
  const avisado = useRef(false);
  const ocultoDesde = useRef<number | null>(null);

  useEffect(() => {
    versionActual.current = scriptCargado();
    // En desarrollo (sin archivos con hash) no hay nada que comparar.
    if (!versionActual.current) return;

    let activo = true;

    /** true si el servidor tiene una versión distinta de la que se está ejecutando. */
    const hayVersionNueva = async () => {
      try {
        const publicada = await scriptPublicado();
        return Boolean(publicada && publicada !== versionActual.current);
      } catch {
        return false; // sin conexión: se reintenta más tarde
      }
    };

    const avisar = () => {
      if (avisado.current) return;
      avisado.current = true;
      toast(t("update.available"), {
        id: "actualizacion",
        description: t("update.hint"),
        duration: Infinity,
        action: { label: t("update.reload"), onClick: () => window.location.reload() },
      });
    };

    const revisar = async () => {
      if (avisado.current) return;
      if ((await hayVersionNueva()) && activo) avisar();
    };

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "hidden") {
        ocultoDesde.current = Date.now();
        return;
      }
      const ausencia = ocultoDesde.current ? Date.now() - ocultoDesde.current : 0;
      ocultoDesde.current = null;
      void (async () => {
        const nueva = await hayVersionNueva();
        if (!activo || !nueva) return;
        if (ausencia >= AUSENCIA_PARA_RECARGA_MS) window.location.reload();
        else avisar();
      })();
    };

    const temporizador = window.setInterval(() => void revisar(), INTERVALO_REVISION_MS);
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    void revisar();

    return () => {
      activo = false;
      window.clearInterval(temporizador);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, [t]);

  return null;
};
