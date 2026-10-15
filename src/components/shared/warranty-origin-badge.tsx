import { useTranslation } from "react-i18next";

import { Badge } from "@/components/shared/status-badge";
import type { WarrantyOrigin } from "@/lib/warranty-origin";

const ORIGIN_TONES = {
  normal: "primary",
  previa: "warning",
  falla_inventario: "destructive",
} as const;

/** Etiqueta que indica si la garantía es normal, previa o por falla de inventario. */
export const WarrantyOriginBadge = ({ origin }: { origin: WarrantyOrigin }) => {
  const { t } = useTranslation();
  return (
    <Badge tone={ORIGIN_TONES[origin]} label={t(`warranty.origin.${origin}`)} withDot={false} />
  );
};
