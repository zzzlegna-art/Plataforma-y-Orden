import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import "./loading-screen-premium.css";
import nexoraLogoSource from "../../../scripts/nexora-logo-source.b64?raw";

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
        <div className="nx-loading-premium__identity" aria-hidden="true">
          <svg viewBox="0 0 610 145" className="nx-loading-premium__brand-lockup" role="img" aria-label="Nexora">
            <svg x="0" y="0" width="145" height="145" viewBox="75 18 300 300">
              <image href={`data:image/png;base64,${nexoraLogoSource.trim()}`} width="448" height="448" />
            </svg>
            <svg x="159" y="22" width="440" height="108" viewBox="10 303 435 107">
              <image href={`data:image/png;base64,${nexoraLogoSource.trim()}`} width="448" height="448" />
            </svg>
          </svg>
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
