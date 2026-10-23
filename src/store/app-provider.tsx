/**
 * Proveedor único de la aplicación.
 *
 * La sesión la administra el servicio de autenticación del backend (Supabase Auth)
 * y el inventario se carga desde la base de datos al iniciar sesión. Cada acción
 * de dominio se ejecuta sobre una copia y, si termina sin errores, se sube al
 * servidor solo lo que cambió. Los cambios que hacen otros dispositivos llegan
 * en vivo por tiempo real y se aplican sin volver a subirse.
 *
 * Escaneo rápido: varias acciones pueden estar guardándose a la vez. Para que la
 * pantalla no "parpadee" (un serial que se agrega, se quita y vuelve a aparecer):
 *  - las acciones toman turno para leer/aplicar sobre el inventario más reciente;
 *  - los guardados viajan en cola, de uno en uno y en orden;
 *  - mientras haya guardados o una descarga en curso, el tiempo real se acumula y se
 *    aplica al final (no pisa lo que aún se está guardando);
 *  - una resincronización completa nunca reemplaza la pantalla con una foto vieja
 *    del servidor: si durante la descarga hubo actividad local, se descarta y se repite.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { BusyIndicator } from "@/components/shared/busy-indicator";
import { LoadingScreen } from "@/components/shared/loading-screen";
import { supabase } from "@/integrations/supabase/client";
import {
  detalleTecnico,
  consultarPerfilSesion,
  leerPerfil,
  pullDb,
  pushDb,
  suscribirCambios,
  type CambioRemoto,
} from "@/lib/backend";
import { cloneDb, DomainError, emptyDb } from "@/lib/db";
import { APP_CURRENCY, setAppCurrency } from "@/lib/format";
import type { Actor, Db, Role } from "@/lib/types";
import { AppContext, type AppValue } from "./contexts";

/** Inventario vacío mientras no hay sesión: las rutas privadas no se muestran. */
const DB_VACIA = emptyDb();

/** Las bitácoras se muestran con lo más reciente primero. */
const AL_INICIO = new Set(["auditLogs", "movements"]);

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

const traducirErrorAuth = (mensaje: string) => {
  const m = mensaje.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "errors.invalidCredentials";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "errors.emailDuplicated";
  }
  if (m.includes("password")) return "errors.passwordTooShort";
  if (m.includes("email")) return "errors.emailInvalid";
  return "errors.unexpected";
};

/**
 * El perfil lo crea un disparador del backend al registrarse; puede tardar unos
 * milisegundos en estar visible, así que se reintenta la lectura.
 */
const buscarPerfil = async (userId: string) => {
  for (let intento = 0; intento < 4; intento += 1) {
    const perfil = await leerPerfil(userId);
    if (perfil) return perfil;
    await esperar(400);
  }
  return null;
};

/**
 * ¿Este cambio modificaría algo de verdad? Los ecos de lo que acabamos de
 * guardar no, y así se evita clonar todo el inventario sin motivo.
 */
const cambioEsNuevo = (db: Db, cambio: CambioRemoto): boolean => {
  if (cambio.coleccion === "settings") {
    const ajustes = cambio.item as Db["settings"] | undefined;
    return Boolean(ajustes) && JSON.stringify(db.settings) !== JSON.stringify(ajustes);
  }

  const filas =
    (db as unknown as Record<string, { id: string }[]>)[cambio.coleccion] ?? [];

  if (cambio.tipo === "borrar") return filas.some((fila) => fila.id === cambio.id);

  const item = cambio.item as { id: string } | undefined;
  if (!item) return false;
  const actual = filas.find((fila) => fila.id === item.id);
  return !actual || JSON.stringify(actual) !== JSON.stringify(item);
};

/**
 * Aplica un cambio llegado del servidor sobre el inventario en memoria.
 * Devuelve true solo si algo cambió de verdad (los ecos de lo propio se ignoran).
 */
const aplicarCambioRemoto = (db: Db, cambio: CambioRemoto): boolean => {
  const destino = db as unknown as Record<string, unknown>;

  if (cambio.coleccion === "settings") {
    const ajustes = cambio.item as Db["settings"] | undefined;
    if (!ajustes) return false;
    if (JSON.stringify(db.settings) === JSON.stringify(ajustes)) return false;
    db.settings = ajustes;
    return true;
  }

  const filas = (destino[cambio.coleccion] as { id: string }[] | undefined) ?? [];

  if (cambio.tipo === "borrar") {
    const restantes = filas.filter((fila) => fila.id !== cambio.id);
    if (restantes.length === filas.length) return false;
    destino[cambio.coleccion] = restantes;
    return true;
  }

  const item = cambio.item as { id: string } | undefined;
  if (!item) return false;

  const indice = filas.findIndex((fila) => fila.id === item.id);
  if (indice < 0) {
    const siguientes = AL_INICIO.has(cambio.coleccion) ? [item, ...filas] : [...filas, item];
    destino[cambio.coleccion] =
      cambio.coleccion === "auditLogs" && siguientes.length > 500
        ? siguientes.slice(0, 500)
        : siguientes;
    return true;
  }

  if (JSON.stringify(filas[indice]) === JSON.stringify(item)) return false;
  filas[indice] = item;
  return true;
};

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [db, setDb] = useState<Db | null>(null);
  const [user, setUser] = useState<Actor | null>(null);
  const [ready, setReady] = useState(false);
  const { t } = useTranslation();
  // Sesión abriéndose: mientras se verifica el perfil y se descarga el inventario.
  const [abriendo, setAbriendo] = useState(false);
  // Guardados en curso en el servidor (para el aviso global "Guardando…").
  const [guardando, setGuardando] = useState(0);
  const dbRef = useRef<Db | null>(null);
  const userRef = useRef<Actor | null>(null);
  const sesionRef = useRef<string | null | undefined>(undefined);
  // Invalida cargas de sesión que terminen después de cerrar sesión o cambiar de usuario.
  const intentoSesionRef = useRef(0);
  const comprobandoPerfilRef = useRef(false);
  const pendientesRef = useRef<CambioRemoto[]>([]);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guardados en curso (desde que la acción se aplica en pantalla hasta que el servidor responde).
  const guardadosRef = useRef(0);
  // Guardados + descargas en curso: mientras sea > 0, el tiempo real solo se acumula.
  const bloqueosRef = useRef(0);
  // Cambia con cada acción local y cada guardado terminado: detecta fotos viejas del servidor.
  const versionRef = useRef(0);
  const refrescandoRef = useRef(false);
  const refrescoPendienteRef = useRef(false);
  // Turno para "leer inventario → ejecutar acción → aplicar en pantalla" y cola de guardados.
  const turnoAccionRef = useRef<Promise<void>>(Promise.resolve());
  const colaGuardadoRef = useRef<Promise<void>>(Promise.resolve());

  const aplicarDb = useCallback((next: Db | null) => {
    dbRef.current = next;
    setDb(next);
    setAppCurrency(next?.settings.currency ?? APP_CURRENCY);
  }, []);

  const aplicarUsuario = useCallback((next: Actor | null) => {
    userRef.current = next;
    setUser(next);
  }, []);

  /** Vuelca en bloque los cambios en vivo acumulados (una sola copia del inventario). */
  const volcarCambios = useCallback(() => {
    temporizadorRef.current = null;
    // Con un guardado o una descarga en curso los cambios se quedan acumulados:
    // se aplican al soltar el último bloqueo (ver liberarBloqueo).
    if (bloqueosRef.current > 0) return;
    const cambios = pendientesRef.current.splice(0);
    const actual = dbRef.current;
    if (cambios.length === 0 || !actual) return;

    // Si nada aporta (por ejemplo el eco de lo que ya guardamos), no se clona nada.
    if (!cambios.some((cambio) => cambioEsNuevo(actual, cambio))) return;

    const siguiente = cloneDb(actual);
    let huboCambios = false;
    for (const cambio of cambios) {
      if (aplicarCambioRemoto(siguiente, cambio)) huboCambios = true;
    }
    if (huboCambios) aplicarDb(siguiente);
  }, [aplicarDb]);

  /** Suelta un bloqueo; al llegar a cero se aplican los cambios en vivo acumulados. */
  const liberarBloqueo = useCallback(() => {
    bloqueosRef.current = Math.max(0, bloqueosRef.current - 1);
    if (bloqueosRef.current > 0) return;
    if (temporizadorRef.current) {
      clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
    }
    volcarCambios();
  }, [volcarCambios]);

  const recibirCambio = useCallback(
    (cambio: CambioRemoto) => {
      pendientesRef.current.push(cambio);
      if (bloqueosRef.current > 0 || temporizadorRef.current) return;
      temporizadorRef.current = setTimeout(volcarCambios, 80);
    },
    [volcarCambios],
  );

  const aplicarCambios = useCallback(
    (cambios: CambioRemoto[]) => {
      cambios.forEach(recibirCambio);
    },
    [recibirCambio],
  );

  const abrirSesion = useCallback(
    async (sesion: { user: { id: string; email?: string | null } } | null) => {
      const id = sesion?.user?.id ?? null;
      if (sesionRef.current === id) return;
      sesionRef.current = id;
      const intento = ++intentoSesionRef.current;

      if (!id) {
        setAbriendo(false);
        aplicarUsuario(null);
        aplicarDb(null);
        return;
      }

      setAbriendo(true);
      try {
        const perfil = await buscarPerfil(id);
        if (intentoSesionRef.current !== intento) return;
        if (!perfil || perfil.is_active === false) {
          await supabase.auth.signOut();
          if (intentoSesionRef.current !== intento) return;
          sesionRef.current = null;
          aplicarUsuario(null);
          aplicarDb(null);
          return;
        }

        const actor: Actor = {
          id,
          email: String(perfil.email ?? sesion?.user.email ?? ""),
          fullName: String(perfil.full_name ?? perfil.email ?? "Usuario"),
          role: perfil.role === "admin" ? "admin" : "bodeguero",
        };

        try {
          const cargada = await pullDb();
          if (intentoSesionRef.current !== intento) return;
          aplicarDb(cargada);
        } catch (error) {
          if (intentoSesionRef.current !== intento) return;
          // Entrar con un inventario vacío o incompleto permitiría duplicar seriales:
          // mejor volver al login con un aviso.
          console.error("No se pudo cargar el inventario", error);
          toast.error(t("errors.loadFailed"));
          await supabase.auth.signOut();
          if (intentoSesionRef.current === intento) {
            sesionRef.current = null;
            aplicarUsuario(null);
            aplicarDb(null);
          }
          return;
        }
        if (intentoSesionRef.current !== intento) return;
        aplicarUsuario(actor);
      } finally {
        if (intentoSesionRef.current === intento) setAbriendo(false);
      }
    },
    [aplicarDb, aplicarUsuario, t],
  );

  useEffect(() => {
    let cancelado = false;

    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      // Nunca llamar al cliente dentro del callback: se difiere al siguiente tick.
      setTimeout(() => {
        if (!cancelado) void abrirSesion(sesion);
      }, 0);
    });

    void supabase.auth
      .getSession()
      .then(({ data }) => abrirSesion(data.session))
      .catch((error) => console.error("No se pudo leer la sesión", error))
      .finally(() => {
        // Ahora "ready" tapa la app con la pantalla de carga: debe cerrarse siempre.
        if (!cancelado) setReady(true);
      });

    return () => {
      cancelado = true;
      suscripcion.subscription.unsubscribe();
    };
  }, [abrirSesion]);

  useEffect(
    () => () => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
    },
    [],
  );

  /**
   * Resincroniza con el servidor (al volver a la app o tras un guardado fallido).
   * La foto del servidor solo se aplica si mientras se descargaba no hubo actividad
   * local; si la hubo (por ejemplo un serial recién escaneado que el servidor aún no
   * tenía), se descarta y se vuelve a intentar: así nunca borra lo que está en pantalla.
   */
  const refrescar = useCallback(async () => {
    if (!userRef.current || refrescandoRef.current) return;
    refrescandoRef.current = true;
    try {
      for (let intento = 0; intento < 3; intento += 1) {
        if (guardadosRef.current > 0) {
          // Se repetirá solo cuando termine el último guardado (ver run).
          refrescoPendienteRef.current = true;
          return;
        }
        refrescoPendienteRef.current = false;
        const versionInicial = versionRef.current;
        bloqueosRef.current += 1;
        let aplicada = false;
        try {
          const servidor = await pullDb();
          if (versionRef.current === versionInicial && guardadosRef.current === 0) {
            aplicarDb(servidor);
            aplicada = true;
          }
        } catch (error) {
          console.error("No se pudo resincronizar el inventario", error);
          return;
        } finally {
          liberarBloqueo();
        }
        if (aplicada) return;
      }
    } finally {
      refrescandoRef.current = false;
    }
  }, [aplicarDb, liberarBloqueo]);

  const run: AppValue["run"] = useCallback(
    async (action) => {
      if (!dbRef.current) throw new DomainError("errors.notReady");
      const actor = userRef.current;
      if (!actor) throw new DomainError("errors.notAuthenticated");

      setGuardando((n) => n + 1);
      try {
        // Turno: cada acción parte del inventario que dejó la anterior (sin perder cambios
        // cuando llegan varias muy seguidas).
        let soltarTurno: () => void = () => undefined;
        const turnoPrevio = turnoAccionRef.current;
        turnoAccionRef.current = new Promise<void>((resolver) => {
          soltarTurno = resolver;
        });
        await turnoPrevio;

        let actual!: Db;
        let borrador!: Db;
        let resultado!: Awaited<ReturnType<typeof action>>;
        try {
          const base = dbRef.current;
          if (!base) throw new DomainError("errors.notReady");
          actual = base;
          borrador = cloneDb(base);
          // La acción valida el negocio aquí mismo; si falla, no se toca nada.
          resultado = await action(borrador, actor);

          // Optimista: la pantalla responde al instante y el guardado sigue detrás.
          aplicarDb(borrador);
          versionRef.current += 1;
          guardadosRef.current += 1;
          bloqueosRef.current += 1;
        } finally {
          soltarTurno();
        }

        let fallo: DomainError | null = null;
        try {
          // Los guardados salen de uno en uno y en orden.
          const tarea = colaGuardadoRef.current.then(() => pushDb(actual, borrador));
          colaGuardadoRef.current = tarea.catch(() => undefined);
          await tarea;
        } catch (error) {
          console.error("No se pudo guardar en el servidor", error);
          fallo =
            error instanceof DomainError
              ? error
              : new DomainError("errors.saveFailed", {
                  detalle: detalleTecnico(error instanceof Error ? error.message : String(error)),
                });
        } finally {
          guardadosRef.current -= 1;
          versionRef.current += 1;
          if (fallo) refrescoPendienteRef.current = true;
          // Al soltar el último bloqueo se aplica lo que llegó en vivo mientras se guardaba.
          liberarBloqueo();
          if (guardadosRef.current === 0 && refrescoPendienteRef.current) {
            // El estado local quedó adelantado (o una descarga anterior se descartó):
            // se recupera la versión del servidor cuando ya no hay nada por guardar.
            void refrescar();
          }
        }

        if (fallo) throw fallo;
        return resultado;
      } finally {
        setGuardando((n) => n - 1);
      }
    },
    [aplicarDb, liberarBloqueo, refrescar],
  );

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") void refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [refrescar]);

  const login = useCallback<AppValue["login"]>(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, error: traducirErrorAuth(error.message) };

    const perfil = await leerPerfil(data.user.id);
    if (!perfil || perfil.is_active === false) {
      await supabase.auth.signOut();
      return { ok: false, error: "errors.userInactive" };
    }
    return { ok: true };
  }, []);

  const logout = useCallback(async () => {
    // Una carga de sesión pendiente ya no debe poder volver a autenticar la interfaz.
    intentoSesionRef.current += 1;
    sesionRef.current = null;
    pendientesRef.current = [];
    setAbriendo(false);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) console.error("No se pudo invalidar la sesión remota", error.message);
    } catch (error) {
      console.error("No se pudo invalidar la sesión remota", error);
    } finally {
      // No dejar la información privada visible aunque falle la petición de cierre.
      aplicarUsuario(null);
      aplicarDb(null);
    }
  }, [aplicarDb, aplicarUsuario]);

  /** Comprueba el estado real del empleado y sincroniza el rol sin recargar la app. */
  const validarPerfilSesion = useCallback(async () => {
    const actorInicial = userRef.current;
    if (!actorInicial || comprobandoPerfilRef.current) return;

    comprobandoPerfilRef.current = true;
    const intento = intentoSesionRef.current;
    try {
      const perfil = await consultarPerfilSesion(actorInicial.id);
      if (
        intento !== intentoSesionRef.current ||
        userRef.current?.id !== actorInicial.id
      ) {
        return;
      }

      // Una fila invisible por RLS o una cuenta desactivada no puede conservar la sesión.
      if (!perfil || perfil.is_active === false) {
        toast.error(t("errors.userInactive"));
        await logout();
        return;
      }

      const actorActual = userRef.current;
      if (!actorActual || actorActual.id !== actorInicial.id) return;

      const actualizado: Actor = {
        id: actorActual.id,
        email: String(perfil.email ?? actorActual.email),
        fullName: String(perfil.full_name ?? perfil.email ?? actorActual.fullName),
        role: perfil.role === "admin" ? "admin" : "bodeguero",
      };
      if (
        actualizado.email !== actorActual.email ||
        actualizado.fullName !== actorActual.fullName ||
        actualizado.role !== actorActual.role
      ) {
        aplicarUsuario(actualizado);
      }
    } catch (error) {
      // Un fallo temporal de red no equivale a una cuenta desactivada.
      console.warn("No se pudo verificar el perfil; se volverá a intentar.", error);
    } finally {
      comprobandoPerfilRef.current = false;
    }
  }, [aplicarUsuario, logout, t]);

  /** Actualiza permisos inmediatamente por tiempo real y también al volver a la pestaña. */
  useEffect(() => {
    if (!user) return;

    let cancelado = false;
    let desuscribir: (() => void) | undefined;

    // La sesión puede haberse aplicado a React antes de que Realtime termine
    // de recibir el JWT. Esperar explícitamente setAuth evita registrar filtros
    // de perfil con el rol anon durante esa pequeña ventana de inicialización.
    void (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (cancelado) return;

      const sesion = data.session;
      if (!sesion || sesion.user.id !== user.id) {
        console.warn("Tiempo real pendiente: no coincide la sesión con el usuario activo.");
        return;
      }

      await supabase.realtime.setAuth(sesion.access_token);
      if (cancelado) return;

      desuscribir = suscribirCambios(recibirCambio, {
        incluirAuditoria: user.role === "admin",
        perfilUsuarioId: user.id,
        alCambiarPerfil: () => void validarPerfilSesion(),
      });
    })().catch((error: unknown) => {
      if (!cancelado) console.warn("No se pudo iniciar tiempo real autenticado.", error);
    });

    return () => {
      cancelado = true;
      desuscribir?.();
    };
  }, [user, recibirCambio, validarPerfilSesion]);

  /** Respaldo si el evento de perfil no llega: revalida cada minuto y al volver al frente. */
  useEffect(() => {
    if (!user) return;

    const alVolver = () => {
      if (document.visibilityState === "visible") void validarPerfilSesion();
    };
    const intervalo = window.setInterval(() => void validarPerfilSesion(), 60_000);
    document.addEventListener("visibilitychange", alVolver);
    alVolver();

    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [user?.id, validarPerfilSesion]);

  const value = useMemo<AppValue>(
    () => ({
      db: db ?? DB_VACIA,
      ready,
      user,
      role: user?.role as Role | undefined,
      run,
      aplicarCambios,
      refrescar,
      login,
      logout,
    }),
    [db, ready, user, run, aplicarCambios, refrescar, login, logout],
  );

  if (user && !db) {
    return <LoadingScreen message={t("app.loadingInventory")} />;
  }

  // La pantalla de carga se dibuja encima (sin desmontar la app) al abrir y al
  // iniciar sesión: así el formulario de acceso conserva sus mensajes de error.
  const cargando = !ready || abriendo;

  return (
    <AppContext.Provider value={value}>
      {children}
      {cargando ? (
        <LoadingScreen message={t(abriendo ? "app.loadingInventory" : "app.starting")} />
      ) : null}
      <BusyIndicator active={guardando > 0} />
    </AppContext.Provider>
  );
};
