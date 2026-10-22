import { useApp } from "./use-app";

/** Datos y ejecución de acciones de dominio. */
export const useStore = () => {
  const { db, run, aplicarCambios, refrescar } = useApp();
  return { db, run, aplicarCambios, refrescar };
};
