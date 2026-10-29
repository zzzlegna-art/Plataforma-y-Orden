import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import "./loading-screen-premium.css";
import { BrandLogo } from "@/components/shared/brand-logo";

/**
 * Pantalla de carga a pantalla completa: se muestra al abrir la app y al iniciar
 * sesión mientras se descarga el inventario. Si tarda, cambia el mensaje para que
 * se note que sigue trabajando.
 */
export const LoadingScreen = ({ message }: { message: string }) => {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div role="status" aria-live="polite" aria-busy="true" className="nx-loading-premium">
      <div className="nx-loading-premium__card animate-fade-in">
        <span className="nx-loading-premium__eyebrow">NEXORA · CENTRO DE OPERACIONES</span>
        <div className="nx-loading-premium__brand" aria-hidden="true">
          <BrandLogo variant="horizontal" className="nx-loading-premium__brand-lockup" alt="Nexora" />
        </div>
        <div>
          <p className="nx-loading-premium__title">{message}</p>
          <p className="nx-loading-premium__hint">{t(slow ? "app.loadingSlow" : "app.loadingHint")}</p>
        </div>
        <div className="nx-loading-premium__progress" aria-hidden="true" />
        <span className="nx-loading-premium__footer">Preparando tu espacio de trabajo</span>
      </div>
    </div>
  );
};
