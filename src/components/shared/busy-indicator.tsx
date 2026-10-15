import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { BrandSpinner } from "@/components/shared/brand-spinner";

/**
 * Aviso global mientras se guarda algo en el servidor: una etiqueta "Guardando…"
 * con el círculo de la marca. Aparece solo si el guardado tarda
 * más de un instante, para que las acciones rápidas no parpadeen.
 */
export const BusyIndicator = ({ active }: { active: boolean }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 250);
    return () => clearTimeout(timer);
  }, [active]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4">
      <div
        role="status"
        className="flex animate-fade-in items-center gap-3 rounded-full border bg-card py-1.5 pl-2 pr-4 text-sm shadow-elegant"
      >
        <BrandSpinner size="sm" />
        {t("app.saving")}
      </div>
    </div>
  );
};
