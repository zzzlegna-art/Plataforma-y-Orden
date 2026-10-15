/**
 * Registro del service worker mínimo que hace instalable la PWA.
 * Es opcional: si el navegador o el contexto lo bloquean, la app sigue igual.
 */
export const registerServiceWorker = () => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registrar = () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // sin service worker la app funciona; solo pierde la instalación
    });
  };
  // Si la página ya terminó de cargar, el evento "load" no volvería a dispararse y el
  // service worker nunca se registraría (sin él, el navegador no ofrece instalar la app).
  if (document.readyState === "complete") registrar();
  else window.addEventListener("load", registrar, { once: true });
};

/** Evento no tipado por TypeScript por defecto (API todavía experimental). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Escucha = () => void;

const CLAVE_INSTALADA = "pwa-instalada";

const leerMarca = () => {
  try {
    return localStorage.getItem(CLAVE_INSTALADA) === "1";
  } catch {
    return false;
  }
};

const guardarMarca = (instalada: boolean) => {
  try {
    if (instalada) localStorage.setItem(CLAVE_INSTALADA, "1");
    else localStorage.removeItem(CLAVE_INSTALADA);
  } catch {
    // Sin almacenamiento: la marca solo dura mientras la pestaña esté abierta.
  }
};

const abiertaComoApp = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (window.navigator as unknown as { standalone?: boolean }).standalone === true;

/**
 * Captura "beforeinstallprompt" desde el momento en que se carga este módulo
 * (antes de que React monte nada), para no perder el evento si el navegador
 * lo dispara antes de que el botón de instalar exista en pantalla.
 *
 * Además recuerda si la app quedó instalada: los navegadores no permiten
 * preguntarlo directamente, así que se deduce (ver `getInstalada`).
 */
class InstalacionPWA {
  private evento: BeforeInstallPromptEvent | null = null;
  private enModoApp = false;
  private marca = false;
  private escuchas = new Set<Escucha>();

  constructor() {
    if (typeof window === "undefined") return;

    this.enModoApp = abiertaComoApp();
    this.marca = leerMarca();

    window.matchMedia("(display-mode: standalone)").addEventListener("change", () => {
      this.enModoApp = abiertaComoApp();
      this.avisar();
    });

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      this.evento = event as BeforeInstallPromptEvent;
      // Si el navegador ofrece instalar, la app definitivamente no está instalada
      // (por ejemplo, se desinstaló desde fuera): se limpia la marca.
      this.marca = false;
      guardarMarca(false);
      this.avisar();
    });

    window.addEventListener("appinstalled", () => {
      this.marca = true;
      guardarMarca(true);
      this.evento = null;
      this.avisar();
    });
  }

  private avisar() {
    this.escuchas.forEach((fn) => fn());
  }

  suscribir(fn: Escucha) {
    this.escuchas.add(fn);
    return () => this.escuchas.delete(fn);
  }

  getEvento() {
    return this.evento;
  }

  /** true si se está usando la app instalada (ventana propia), no una pestaña del navegador. */
  getEnModoApp() {
    return this.enModoApp;
  }

  /** La app se considera instalada si se abrió como app o si se instaló desde este navegador. */
  getInstalada() {
    return this.enModoApp || this.marca;
  }

  async instalar() {
    if (!this.evento) return "sin-evento" as const;
    await this.evento.prompt();
    const { outcome } = await this.evento.userChoice;
    this.evento = null;
    if (outcome === "accepted") {
      this.marca = true;
      guardarMarca(true);
      this.avisar();
    }
    return outcome;
  }
}

/** Instancia única creada al importar este módulo (arranque de la app). */
export const instalacionPWA = new InstalacionPWA();
