import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { CustomerCategoriaMayorista } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { PencilLine, Plus, Users } from "lucide-react";

import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { SearchField } from "@/components/shared/search-field";
import { ActiveBadge, CustomerCategoriaBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import { setCustomerActive } from "@/lib/actions/customers";
import { CustomerFormDialog } from "./CustomerFormDialog";

/** Catálogo de clientes mayoristas. */
const Clientes = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const includeInactive = params.get("inactivas") === "1";
  const setSearch = (texto: string) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (texto) next.set("q", texto);
    else next.delete("q");
    return next;
  }, { replace: true });
  const toggleInactive = () => setParams((prev) => {
    const next = new URLSearchParams(prev);
    if (prev.get("inactivas") === "1") next.delete("inactivas");
    else next.set("inactivas", "1");
    return next;
  }, { replace: true });
  const [categoriaFiltro, setCategoriaFiltro] = useState<CustomerCategoriaMayorista | undefined>(undefined);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return db.customers
      .filter((customer) => (includeInactive ? true : customer.isActive))
      .filter((customer) => {
        if (!categoriaFiltro) return true;
        const propia = customer.categoriaMayorista ?? "ambos";
        // "Ambos" vende también celulares y también repuestos: cuenta en los dos filtros.
        return propia === categoriaFiltro || propia === "ambos";
      })
      .filter(
        (customer) =>
          !needle ||
          customer.name.toLowerCase().includes(needle) ||
          (customer.taxId ?? "").toLowerCase().includes(needle) ||
          (customer.contactName ?? "").toLowerCase().includes(needle),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [db.customers, search, includeInactive, categoriaFiltro]);

  const ordersOf = (customerId: string) =>
    db.orders.filter((order) => order.customerId === customerId).length;

  return (
    <div className="nx-management nx-customers space-y-4 stagger">
      <PageHeader
        title={t("customer.title")}
        description={t("customer.subtitle")}
        actions={
          <CustomerFormDialog
            trigger={
              <Button>
                <Plus />
                {t("customer.new")}
              </Button>
            }
          />
        }
      />

      <div className="nx-customers-filters space-y-3 rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={t("customer.searchPlaceholder")}
            className="sm:max-w-xs"
          />
          <Button
            variant={includeInactive ? "default" : "outline"}
            size="sm"
            className="w-fit"
            onClick={toggleInactive}
          >
            {t("customer.includeInactive")}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {([undefined, "celulares", "repuestos", "ambos"] as const).map((opcion) => (
            <Button
              key={opcion ?? "todos"}
              type="button"
              size="sm"
              variant={categoriaFiltro === opcion ? "default" : "outline"}
              onClick={() => setCategoriaFiltro(opcion)}
            >
              {opcion ? t(`customerCat.${opcion}Corto`) : t("customer.filterAll")}
            </Button>
          ))}
        </div>
      </div>

      <DataTable
        className="nx-customers-table"
        rows={rows}
        rowKey={(customer) => customer.id}
        emptyTitle={search || categoriaFiltro ? t("customer.emptyFilteredTitle") : t("customer.emptyTitle")}
        emptyDescription={
          search || categoriaFiltro ? t("customer.emptyFilteredDescription") : t("customer.emptyDescription")
        }
        emptyIcon={Users}
        emptyAction={
          !search && !categoriaFiltro ? (
            <CustomerFormDialog
              trigger={
                <Button>
                  <Plus />
                  {t("customer.new")}
                </Button>
              }
            />
          ) : undefined
        }
        footer={t("common.resultsCount", { count: rows.length })}
        renderCard={(customer) => (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{customer.name}</p>
                <p className="font-tabular truncate text-xs text-muted-foreground">
                  {customer.taxId ?? t("common.noTaxId")}
                </p>
              </div>
              <ActiveBadge isActive={customer.isActive} />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {customer.contactName ?? "—"} · {customer.phone ?? "—"}
            </p>
            <CustomerCategoriaBadge categoria={customer.categoriaMayorista} />
            <div className="flex gap-2">
              <CustomerFormDialog
                customer={customer}
                trigger={
                  <Button size="sm" variant="outline" className="flex-1">
                    <PencilLine />
                    {t("common.edit")}
                  </Button>
                }
              />
              <Button
                size="sm"
                variant="ghost"
                className="flex-1"
                onClick={() =>
                  void runAction(
                    (db2, actor) =>
                      setCustomerActive(db2, actor, {
                        id: customer.id,
                        isActive: !customer.isActive,
                      }),
                    { success: "customer.updated", key: `cliente-activo:${customer.id}` },
                  )
                }
              >
                {customer.isActive ? t("common.deactivate") : t("common.activate")}
              </Button>
            </div>
          </div>
        )}
        columns={[
          {
            key: "name",
            header: t("customer.name"),
            cell: (customer) => (
              <div className="min-w-0">
                <p className="truncate font-medium">{customer.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {customer.contactName ?? "—"}
                </p>
              </div>
            ),
          },
          {
            key: "taxId",
            header: t("customer.taxId"),
            cell: (customer) => (
              <span className="font-tabular text-sm">{customer.taxId ?? "—"}</span>
            ),
          },
          {
            key: "contact",
            header: t("customer.contact"),
            cell: (customer) => (
              <div className="text-sm">
                <p>{customer.phone ?? "—"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {customer.email ?? "—"}
                </p>
              </div>
            ),
          },
          {
            key: "categoria",
            header: t("customer.categoriaColumn"),
            cell: (customer) => <CustomerCategoriaBadge categoria={customer.categoriaMayorista} />,
          },
          {
            key: "orders",
            header: t("customer.orders"),
            align: "right",
            cell: (customer) => (
              <span className="font-tabular text-sm">{ordersOf(customer.id)}</span>
            ),
          },
          {
            key: "status",
            header: t("common.status"),
            cell: (customer) => <ActiveBadge isActive={customer.isActive} />,
          },
          {
            key: "actions",
            header: t("common.actions"),
            align: "right",
            cell: (customer) => (
              <div className="flex justify-end gap-1">
                <CustomerFormDialog
                  customer={customer}
                  trigger={
                    <Button size="sm" variant="ghost">
                      <PencilLine />
                    </Button>
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void runAction(
                      (db2, actor) =>
                        setCustomerActive(db2, actor, {
                          id: customer.id,
                          isActive: !customer.isActive,
                        }),
                      { success: "customer.updated", key: `cliente-activo:${customer.id}` },
                    )
                  }
                >
                  {customer.isActive ? t("common.deactivate") : t("common.activate")}
                </Button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};

export default Clientes;
