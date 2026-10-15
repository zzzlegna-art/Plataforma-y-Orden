import { useContext } from "react";

import { AppContext, type AppValue } from "@/store/contexts";

/** Acceso al contexto raíz de la aplicación. */
export const useApp = (): AppValue => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp debe usarse dentro de AppProvider");
  }
  return context;
};
