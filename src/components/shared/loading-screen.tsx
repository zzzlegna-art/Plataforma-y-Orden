import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { BrandSpinner } from "@/components/shared/brand-spinner";

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
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-background px-6"
    >
      <div className="flex w-full max-w-xs animate-fade-in flex-col items-center gap-6 text-center">
        <BrandSpinner />
        <div className="space-y-1">
          <p className="font-medium">{message}</p>
          <p className="text-xs text-muted-foreground">
            {t(slow ? "app.loadingSlow" : "app.loadingHint")}
          </p>
        </div>
      </div>
    </div>
  );
};
