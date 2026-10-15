import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Download, Share, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { instalacionPWA } from "@/lib/pwa";
import { cn } from "@/lib/utils";

type Plataforma = "ios" | "android" | "escritorio";
type Guia = "instalar" | "desinstalar";

const detectarPlataforma = (): Plataforma => {
  const agente = window.navigator.userAgent;
  // iPadOS se presenta como Mac, pero tiene pantalla táctil.
  const esIOS =
    /iphone|ipad|ipod/i.test(agente) ||
    (/macintosh/i.test(agente) && window.navigator.maxTouchPoints > 1);
  if (esIOS) return "ios";
  if (/android/i.test(agente)) return "android";
  return "escritorio";
};

const esFirefox = () => /firefox|fxios/i.test(window.navigator.userAgent);
const esWindows = () => /windows/i.test(window.navigator.userAgent);

/** Los textos guardan la numeración ("1. …"); aquí la numera la lista. */
const sinNumero = (texto: string) => texto.replace(/^\d+\.\s*/, "");

/**
 * Un solo botón para instalar y desinstalar la app:
 * - Sin instalar: usa el instalador nativo (Android/Chrome/Edge) o muestra los pasos manuales.
 * - Firefox de escritorio: sin instalador automático; guía con «Agregar a la barra de tareas» (Windows).
 * - Instalada: abre la guía para desinstalar. Los navegadores no permiten desinstalar una
 *   app web desde código, así que el botón explica el camino exacto según el dispositivo.
 */
export const InstallAppButton = ({
  variant = "sidebar",
  soloInstalar = false,
}: {
  variant?: "sidebar" | "hero";
  /** En el login no tiene sentido ofrecer "Desinstalar": si ya está instalada, no se muestra. */
  soloInstalar?: boolean;
}) => {
  const { t } = useTranslation();
  const [, forzarRefresco] = useState(0);
  const [guia, setGuia] = useState<Guia | null>(null);

  useEffect(() => {
    const cancelar = instalacionPWA.suscribir(() => forzarRefresco((n) => n + 1));
    return () => {
      cancelar();
    };
  }, []);

  const instalada = instalacionPWA.getInstalada();
  const enModoApp = instalacionPWA.getEnModoApp();
  const hayEventoNativo = Boolean(instalacionPWA.getEvento());
  const plataforma = detectarPlataforma();

  const firefox = esFirefox();

  if (soloInstalar && instalada) return null;

  const onClick = async () => {
    if (instalada) {
      setGuia("desinstalar");
      return;
    }
    if (hayEventoNativo) {
      await instalacionPWA.instalar();
      return;
    }
    setGuia("instalar");
  };

  const pasos: { texto: string; icono?: ReactNode }[] = [];
  let titulo = "";
  let subtitulo = "";
  let nota = "";
  let extra = "";

  if (guia === "desinstalar") {
    titulo = t("install.uninstallTitle");
    subtitulo = t("install.uninstallSubtitle");
    nota = t("install.uninstallNote");
    if (plataforma === "escritorio" && firefox) {
      pasos.push({ texto: t("install.firefoxUnpin") });
      pasos.push({ texto: t("install.firefoxDeleteShortcut") });
    } else if (plataforma === "escritorio") {
      if (!enModoApp) pasos.push({ texto: t("install.uninstallOpenApp") });
      pasos.push({ texto: t("install.uninstallDesktopMenu") });
      pasos.push({ texto: t("install.uninstallDesktopChoose") });
      extra = t("install.uninstallDesktopAlt");
    } else if (plataforma === "android") {
      pasos.push({ texto: t("install.uninstallHold") });
      pasos.push({ texto: t("install.uninstallAndroidChoose") });
    } else {
      pasos.push({ texto: t("install.uninstallHold") });
      pasos.push({ texto: t("install.uninstallIosChoose") });
    }
  } else if (guia === "instalar") {
    if (plataforma === "ios") {
      titulo = t("install.iosTitle");
      subtitulo = t("install.iosSubtitle");
      pasos.push({
        texto: t("install.iosStep1"),
        icono: <Share className="h-4 w-4 shrink-0 text-primary" />,
      });
      pasos.push({ texto: t("install.iosStep2") });
      pasos.push({ texto: t("install.iosStep3") });
    } else if (plataforma === "escritorio" && firefox) {
      titulo = t("install.manualTitle");
      if (esWindows()) {
        subtitulo = t("install.firefoxSubtitle");
        pasos.push({ texto: t("install.firefoxStep1") });
        pasos.push({ texto: t("install.firefoxStep2") });
        // Firefox no avisa si la app quedó agregada: la guía para quitarla va en la misma ventana.
        extra = t("install.firefoxUninstallHint");
      } else {
        subtitulo = t("install.firefoxUnsupported");
      }
    } else {
      titulo = t("install.manualTitle");
      subtitulo = t("install.manualSubtitle");
      if (plataforma === "android") {
        pasos.push({ texto: t("install.manualAndroid1") });
        pasos.push({ texto: t("install.manualAndroid2") });
      } else {
        pasos.push({ texto: t("install.manualDesktop1") });
        pasos.push({ texto: t("install.manualDesktop2") });
      }
      pasos.push({ texto: t("install.manualConfirm") });
      extra = t("install.manualUninstallHint");
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant === "sidebar" ? "sidebar" : "outline"}
        onClick={() => void onClick()}
        className={cn("w-full", variant === "hero" ? "justify-center" : "justify-start")}
      >
        {instalada ? (
          <Trash2 className="shrink-0 text-destructive" />
        ) : (
          <Download className="shrink-0 text-primary" />
        )}
        <span className="truncate font-medium">
          {t(instalada ? "install.uninstallButton" : "install.button")}
        </span>
      </Button>

      <Dialog open={guia !== null} onOpenChange={(abierto) => !abierto && setGuia(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{subtitulo}</DialogDescription>
          </DialogHeader>
          {pasos.length > 0 ? (
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            {pasos.map((paso) => (
              <li key={paso.texto}>
                <span className="inline-flex items-start gap-2">
                  {paso.icono}
                  <span>{sinNumero(paso.texto)}</span>
                </span>
              </li>
            ))}
          </ol>
          ) : null}
          {extra ? <p className="text-xs text-muted-foreground">{extra}</p> : null}
          {nota ? <p className="text-xs text-muted-foreground">{nota}</p> : null}
        </DialogContent>
      </Dialog>
    </>
  );
};
