import { useApp } from "./use-app";

/** Sesión actual: usuario autenticado, login y logout. */
export const useAuth = () => {
  const { user, login, logout, ready } = useApp();
  return { user, login, logout, ready, isAuthenticated: Boolean(user) };
};
