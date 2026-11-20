import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import "./loading-screen-premium.css";

/**
 * Pantalla de carga a pantalla completa: indicador de marca minimalista
 * mientras se prepara el espacio de trabajo.
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
      <div className="nx-loading-premium__card">
        <div className="nx-loading-premium__loader" aria-hidden="true">
          <span className="nx-loading-premium__loader-orbit" />
          <span className="nx-loading-premium__loader-core">N</span>
        </div>
        <div>
          <p className="nx-loading-premium__title">{message}</p>
          <p className="nx-loading-premium__hint">{t(slow ? "app.loadingSlow" : "app.loadingHint")}</p>
        </div>
      </div>
    </div>
  );
};
