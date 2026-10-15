import { Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { useRunAction } from "@/hooks/use-run-action";
import { deshacerEstadoGarantia, estadoAnteriorGarantia } from "@/lib/actions/warranties";
import type { Warranty } from "@/lib/types";

/**
 * Botón «Deshacer» de un caso de garantía: lo devuelve al estado anterior. Solo aparece cuando
 * ese paso se puede revertir sin tocar el inventario (ver `estadoAnteriorGarantia`).
 */
export const DeshacerEstadoButton = ({
  warranty,
  size = "sm",
}: {
  warranty: Warranty;
  size?: "sm" | "default";
}) => {
  const { t } = useTranslation();
  const runAction = useRunAction();
  const { can } = usePermissions();
  const anterior = estadoAnteriorGarantia(warranty);
  if (!anterior || !can("warranties.manage")) return null;

  return (
    <ConfirmDialog
      title={t("warranty.undoTitle")}
      description={t("warranty.undoHint", { estado: t(`warrantyStatus.${anterior}`) })}
      confirmLabel={t("warranty.undoConfirm")}
      onConfirm={async () => {
        await runAction(
          (db, actor) => deshacerEstadoGarantia(db, actor, { warrantyId: warranty.id }),
          { success: "warranty.undone" },
        );
      }}
      trigger={
        <Button size={size} variant="ghost">
          <Undo2 />
          {t("warranty.undo")}
        </Button>
      }
    />
  );
};
