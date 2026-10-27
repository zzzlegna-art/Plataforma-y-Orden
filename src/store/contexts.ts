import { createContext } from "react";
import type { CambioRemoto } from "@/lib/backend";
import type { Actor, Role, Db } from "@/lib/types";

export type RunAction = <T>(
  action: (db: Db, actor: Actor) => T | Promise<T>,
  options?: { deferOptimistic?: boolean },
) => Promise<T>;

export interface AppValue {
  /** Datos cargados desde el backend; vacío mientras no hay sesión. */
  db: Db;
  ready: boolean;
  user: Actor | null;
  role: Role | undefined;
  run: RunAction;
  /**
   * Aplica en pantalla, al instante, cambios que el servidor ya guardó por su cuenta (por
   * ejemplo las marcas del control físico). No vuelve a guardar nada: es lo mismo que hace
   * el tiempo real con los cambios de otros dispositivos.
   */
  aplicarCambios: (cambios: CambioRemoto[]) => void;
  /** Resincroniza una foto completa del servidor sin aplicar miles de cambios uno por uno. */
  refrescar: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

export const AppContext = createContext<AppValue | null>(null);
