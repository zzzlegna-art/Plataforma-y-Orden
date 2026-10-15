import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { BrandSpinner } from "@/components/shared/brand-spinner";

/**
 * Pantalla de despedida al cerrar sesión: cubre la app con un fundido suave mientras
 * se cierra la sesión. Va en un portal porque la barra superior tiene backdrop-blur,
 * que haría que un elemento "fixed" no cubriera toda la pantalla.
 */
export const LogoutScreen = () => {
  const { t } = useTranslation();

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[95] flex animate-fade-in items-center justify-center bg-background px-6"
    >
      <div className="flex animate-pop-in flex-col items-center gap-6 text-center motion-reduce:animate-none">
        <BrandSpinner />
        <div className="space-y-1">
          <p className="font-medium">{t("auth.loggingOut")}</p>
          <p className="text-xs text-muted-foreground">{t("auth.loggingOutHint")}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
};
