import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRunAction } from "@/hooks/use-run-action";
import { setUnitStatus } from "@/lib/actions/units";
import type { Unit, UnitStatus } from "@/lib/types";

/** Ajuste manual de estado entre las ubicaciones del inventario. */
export const UnitStatusMenu = ({ unit, label }: { unit: Unit; label?: string }) => {
  const { t } = useTranslation();
  const runAction = useRunAction();

  const options = (["en_bodega", "en_local", "defectuoso"] as UnitStatus[]).filter(
    (status) => status !== unit.status,
  );

  if (options.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          {label ?? t("unit.changeStatus")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("unit.changeStatus")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((status) => (
          <DropdownMenuItem
            key={status}
            onSelect={() =>
              void runAction(
                (db, actor) => setUnitStatus(db, actor, { id: unit.id, status }),
                { success: "unit.statusChanged", key: `unidad-estado:${unit.id}` },
              )
            }
          >
            {t(`unitStatus.${status}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
