import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { DrawnCheckIcon } from "@/components/shared/drawn-check-icon";

import { DomainError } from "@/lib/db";
import type { Actor, Db } from "@/lib/types";
import { useStore } from "./use-store";

/**
 * Ejecuta una acción de dominio y traduce cualquier error de negocio a un aviso.
 * Devuelve el resultado, o null si la acción falló.
 *
 * Las llamadas se ponen en fila: cada una espera a que la anterior termine del todo (incluido
 * que su cambio ya haya quedado reflejado en pantalla) antes de empezar. Sin esto, dos acciones
 * disparadas muy seguido (por ejemplo escanear dos seriales rápido) podían solaparse: la
 * segunda arrancaba con una copia de los datos anterior a que la primera hubiera terminado, y
 * al aplicarse borraba el cambio de la primera — un serial que se agregaba, desaparecía un
 * momento, y volvía a aparecer solo cuando el servidor terminaba de corregir la pantalla.
 * Ponerlas en fila no descarta ningún escaneo (a diferencia de simplemente ignorar el segundo
 * mientras el primero está en curso): cada uno se procesa, solo que uno después del otro.
 *
 * También trae `pending`: true mientras hay algo en la fila (incluye el guardado en el
 * servidor), para mostrar un botón cargando: `<Button loading={runAction.pending}>`.
 */
export const useRunAction = () => {
  const { run } = useStore();
  const { t } = useTranslation();
  const [enCurso, setEnCurso] = useState(0);
  const colaRef = useRef<Promise<unknown>>(Promise.resolve());
  const enVueloRef = useRef(new Map<string, Promise<unknown>>());

  const ejecutar = useCallback(
    <T,>(
      action: (db: Db, actor: Actor) => T | Promise<T>,
      options?: {
        success?: string;
        successParams?: Record<string, string | number>;
        /** Confirmaciones con más peso (crear o despachar un pedido): el ícono se dibuja con el
         * trazo en vez de aparecer de golpe. No cambia cuándo se muestra el aviso ni retrasa nada. */
        weighty?: boolean;
        /** Evita el doble clic: si ya hay en curso una acción con esta misma clave, el clic repetido
         * se ignora y se devuelve la misma promesa. No usar en acciones que sí deben repetirse
         * (como escanear dos seriales seguidos). */
        key?: string;
      },
    ): Promise<T | null> => {
      const clave = options?.key;
      if (clave) {
        const previa = enVueloRef.current.get(clave);
        if (previa) return previa as Promise<T | null>;
      }
      setEnCurso((n) => n + 1);
      const ejecutarUna = async (): Promise<T | null> => {
        try {
          const result = await run(action);
          if (options?.success) {
            toast.success(t(options.success, options.successParams), {
              icon: options.weighty ? <DrawnCheckIcon /> : undefined,
            });
          }
          return result;
        } catch (error) {
          if (error instanceof DomainError) {
            toast.error(t(error.key, error.params));
          } else {
            toast.error(t("errors.unexpected"));
          }
          return null;
        } finally {
          setEnCurso((n) => n - 1);
        }
      };
      // Encadenada sobre lo que ya estaba en fila; si algo antes falló, no debe romper la
      // cadena para las siguientes acciones.
      const tarea = colaRef.current.then(ejecutarUna, ejecutarUna);
      colaRef.current = tarea;
      if (clave) {
        enVueloRef.current.set(clave, tarea);
        void tarea.finally(() => {
          if (enVueloRef.current.get(clave) === tarea) enVueloRef.current.delete(clave);
        });
      }
      return tarea;
    },
    [run, t],
  );

  return Object.assign(ejecutar, { pending: enCurso > 0 });
};
