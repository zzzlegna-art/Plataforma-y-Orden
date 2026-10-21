import { Archive, History } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import HistorialSerial from "@/pages/seriales";
import SerialesPrevios from "@/pages/seriales-previos";

/** Une la trazabilidad de unidades actuales con el registro de seriales previos. */
const TrazabilidadSeriales = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const activeTab = params.get("view") === "previos" ? "previos" : "historial";

  const changeTab = (tab: "historial" | "previos") => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (tab === "previos") {
        next.set("view", "previos");
      } else {
        next.delete("view");
      }
      return next;
    });
  };

  return (
    <div className="space-y-5 stagger">
      <PageHeader
        title={t("serialTrace.title")}
        description={t("serialTrace.subtitle")}
      />

      <div className="flex flex-wrap gap-2 rounded-lg border bg-card p-2 shadow-sm" role="group" aria-label={t("serialTrace.tabsLabel")}>
        <Button
          type="button"
          variant={activeTab === "historial" ? "default" : "outline"}
          size="sm"
          aria-pressed={activeTab === "historial"}
          onClick={() => changeTab("historial")}
        >
          <History />
          {t("serialHistory.title")}
        </Button>
        <Button
          type="button"
          variant={activeTab === "previos" ? "default" : "outline"}
          size="sm"
          aria-pressed={activeTab === "previos"}
          onClick={() => changeTab("previos")}
        >
          <Archive />
          {t("serialesPrevios.title")}
        </Button>
      </div>

      {activeTab === "historial" ? <HistorialSerial embedded /> : <SerialesPrevios embedded />}
    </div>
  );
};

export default TrazabilidadSeriales;
