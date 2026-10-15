import { useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { valorIntermedio } from "@/lib/animated-number";

/**
 * Muestra un número que, cuando cambia, se desliza suavemente hasta el nuevo valor en vez de
 * saltar de golpe (para indicadores del panel: valor de inventario, unidades disponibles...).
 * En la primera vez que aparece no anima: muestra el valor final directo.
 */
export const AnimatedNumber = ({
  value,
  formatter,
  durationMs = 600,
}: {
  value: number;
  formatter: (value: number) => string;
  durationMs?: number;
}) => {
  const reducido = usePrefersReducedMotion();
  const [mostrado, setMostrado] = useState(value);
  const desdeRef = useRef(value);
  const inicioRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const esPrimeraVezRef = useRef(true);

  useEffect(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    // La primera vez que se monta (o si no hay preferencia de animar) se muestra directo.
    if (esPrimeraVezRef.current || reducido) {
      esPrimeraVezRef.current = false;
      setMostrado(value);
      desdeRef.current = value;
      return;
    }
    if (value === desdeRef.current) return;

    const desde = desdeRef.current;
    inicioRef.current = null;

    const paso = (ahora: number) => {
      if (inicioRef.current === null) inicioRef.current = ahora;
      const transcurrido = ahora - inicioRef.current;
      const siguiente = valorIntermedio(desde, value, transcurrido, durationMs);
      setMostrado(siguiente);
      if (transcurrido < durationMs) {
        frameRef.current = requestAnimationFrame(paso);
      } else {
        desdeRef.current = value;
      }
    };
    frameRef.current = requestAnimationFrame(paso);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reducido]);

  return <>{formatter(Math.round(mostrado))}</>;
};
