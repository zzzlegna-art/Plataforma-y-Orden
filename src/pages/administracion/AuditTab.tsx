import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollText } from "lucide-react";

import { DataTable } from "@/components/shared/data-table";
import { SearchField } from "@/components/shared/search-field";
import { Badge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/hooks/use-store";
import { formatDateTime } from "@/lib/format";

const ENTITIES = [
  "",
  "product",
  "productType",
  "reception",
  "unit",
  "order",
  "customer",
  "warranty",
  "user",
  "category",
  "brand",
] as const;

/** Bitácora de actividad: quién hizo qué sobre qué registro. */
export const AuditTab = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const [search, setSearch] = useState("");
  const [entity, setEntity] = useState<string>("");

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return db.auditLogs
      .filter((log) => (entity ? log.entity === entity : true))
      .filter(
        (log) =>
          !needle ||
          log.userEmail.toLowerCase().includes(needle) ||
          (log.details ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 200);
  }, [db.auditLogs, search, entity]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("audit.description")}</p>

      <div className="space-y-2">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t("audit.searchPlaceholder")}
          className="sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {ENTITIES.map((option) => (
            <Button
              key={option || "all"}
              variant={entity === option ? "default" : "outline"}
              size="sm"
              onClick={() => setEntity(option)}
            >
              {option ? t(`auditEntity.${option}`) : t("common.all")}
            </Button>
          ))}
        </div>
      </div>

      <DataTable
        rows={rows}
        rowKey={(log) => log.id}
        emptyTitle={t("audit.emptyTitle")}
        emptyDescription={t("audit.emptyDescription")}
        emptyIcon={ScrollText}
        footer={t("common.resultsCount", { count: rows.length })}
        renderCard={(log) => (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Badge label={t(`auditAction.${log.action}`)} withDot={false} />
              <span className="text-xs text-muted-foreground">
                {formatDateTime(log.createdAt)}
              </span>
            </div>
            <p className="truncate text-sm">{log.details ?? "—"}</p>
            <p className="truncate text-xs text-muted-foreground">
              {log.userEmail} · {t(`auditEntity.${log.entity}`)}
            </p>
          </div>
        )}
        columns={[
          {
            key: "date",
            header: t("common.date"),
            cell: (log) => (
              <span className="whitespace-nowrap text-sm text-muted-foreground">
                {formatDateTime(log.createdAt)}
              </span>
            ),
          },
          {
            key: "user",
            header: t("user.title"),
            cell: (log) => <span className="text-sm">{log.userEmail}</span>,
          },
          {
            key: "action",
            header: t("audit.action"),
            cell: (log) => <Badge label={t(`auditAction.${log.action}`)} withDot={false} />,
          },
          {
            key: "entity",
            header: t("audit.entity"),
            cell: (log) => <span className="text-sm">{t(`auditEntity.${log.entity}`)}</span>,
          },
          {
            key: "details",
            header: t("audit.details"),
            cell: (log) => (
              <span className="text-sm text-muted-foreground">{log.details ?? "—"}</span>
            ),
          },
        ]}
      />
    </div>
  );
};
