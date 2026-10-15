import { useApp } from "./use-app";

/** Datos y ejecución de acciones de dominio. */
export const useStore = () => {
  const { db, run, aplicarCambios } = useApp();
  return { db, run, aplicarCambios };
};
