import { Archive, History, ScanLine, Unlock } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { RequirePermission } from "@/components/auth/require-auth";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import LiberarSeriales from "@/pages/liberar";
import HistorialSerial from "@/pages/seriales";
import SerialesPrevios from "@/pages/seriales-previos";
import Unidades from "@/pages/unidades";

type SerialTab = "seriales" | "historial" | "previos" | "liberar";

const isSerialTab = (value: string | null): value is SerialTab =>
  value === "seriales" || value === "historial" || value === "previos" || value === "liberar";

/** Un único espacio para consultar, auditar y operar seriales. */
const TrazabilidadSeriales = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const canRelease = can("users.manage");
  const requestedTab = params.get("view");
  const activeTab: SerialTab =
    requestedTab === "liberar" && !canRelease
      ? "seriales"
      : isSerialTab(requestedTab)
        ? requestedTab
        : params.has("serial")
          ? "historial"
          : "seriales";

  const changeTab = (tab: SerialTab) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (tab === "seriales") {
        next.delete("view");
      } else {
        next.set("view", tab);
      }
      if (tab !== "historial") next.delete("serial");
      return next;
    });
  };

  return (
    <div className="space-y-5 stagger">
      <PageHeader
        title={t("serialTrace.title")}
        description={t("serialTrace.subtitle")}
      />

      <div
        className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-2 shadow-sm sm:grid-cols-4"
        role="group"
        aria-label={t("serialTrace.tabsLabel")}
      >
        <Button
          type="button"
          variant={activeTab === "seriales" ? "default" : "outline"}
          size="sm"
          className="min-w-0"
          aria-pressed={activeTab === "seriales"}
          onClick={() => changeTab("seriales")}
        >
          <ScanLine className="mr-2 h-4 w-4 shrink-0" />
          {t("nav.units")}
        </Button>
        <Button
          type="button"
          variant={activeTab === "historial" ? "default" : "outline"}
          size="sm"
          className="min-w-0"
          aria-pressed={activeTab === "historial"}
          onClick={() => changeTab("historial")}
        >
          <History className="mr-2 h-4 w-4 shrink-0" />
          {t("serialHistory.title")}
        </Button>
        <Button
          type="button"
          variant={activeTab === "previos" ? "default" : "outline"}
          size="sm"
          className="min-w-0"
          aria-pressed={activeTab === "previos"}
          onClick={() => changeTab("previos")}
        >
          <Archive className="mr-2 h-4 w-4 shrink-0" />
          {t("serialesPrevios.title")}
        </Button>
        {canRelease ? (
          <Button
            type="button"
            variant={activeTab === "liberar" ? "default" : "outline"}
            size="sm"
            className="min-w-0"
            aria-pressed={activeTab === "liberar"}
            onClick={() => changeTab("liberar")}
          >
            <Unlock className="mr-2 h-4 w-4 shrink-0" />
            {t("liberar.title")}
          </Button>
        ) : null}
      </div>

      {activeTab === "seriales" ? <Unidades embedded /> : null}
      {activeTab === "historial" ? <HistorialSerial embedded /> : null}
      {activeTab === "previos" ? <SerialesPrevios embedded /> : null}
      {activeTab === "liberar" ? (
        <RequirePermission permission="users.manage">
          <LiberarSeriales embedded />
        </RequirePermission>
      ) : null}
    </div>
  );
};

export default TrazabilidadSeriales;
