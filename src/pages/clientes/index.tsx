import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { CustomerCategoriaMayorista } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { PencilLine, Plus, Users } from "lucide-react";
import "./clientes-premium.css";

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

  const overview = useMemo(() => {
    const active = db.customers.filter((customer) => customer.isActive).length;
    return {
      total: db.customers.length,
      active,
      inactive: db.customers.length - active,
      orders: db.orders.length,
    };
  }, [db.customers, db.orders]);

  const categoryCounts = useMemo(() => {
    const available = db.customers.filter((customer) => includeInactive || customer.isActive);
    return {
      todos: available.length,
      celulares: available.filter((customer) => {
        const categoria = customer.categoriaMayorista ?? "ambos";
        return categoria === "celulares" || categoria === "ambos";
      }).length,
      repuestos: available.filter((customer) => {
        const categoria = customer.categoriaMayorista ?? "ambos";
        return categoria === "repuestos" || categoria === "ambos";
      }).length,
      ambos: available.filter((customer) => (customer.categoriaMayorista ?? "ambos") === "ambos").length,
    };
  }, [db.customers, includeInactive]);

  const ordersOf = (customerId: string) =>
    db.orders.filter((order) => order.customerId === customerId).length;

  return (
    <div className="nx-customers-premium nx-customers-crm space-y-5">
      <section className="nx-crm-masthead" aria-label="Cartera comercial">
        <div className="nx-crm-kicker">
          <span className="nx-crm-kicker-dot" aria-hidden="true" />
          <span>NEXORA · RELACIONES COMERCIALES</span>
          <span className="nx-crm-kicker-right">DIRECTORIO B2B</span>
        </div>
        <PageHeader
          className="nx-crm-page-heading flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          title={t("customer.title")}
          description={t("customer.subtitle")}
          actions={
            <CustomerFormDialog
              trigger={
                <Button className="nx-crm-create">
                  <Plus />
                  {t("customer.new")}
                </Button>
              }
            />
          }
        />
        <div className="nx-crm-ledger" aria-label="Resumen de clientes">
          {[
            { label: "En cartera", value: overview.total },
            { label: "Activos", value: overview.active },
            { label: "Inactivos", value: overview.inactive },
            { label: "Pedidos registrados", value: overview.orders },
          ].map(({ label, value }) => (
            <div className="nx-crm-ledger-item" key={label}>
              <span className="nx-crm-ledger-label">{label}</span>
              <strong className="nx-crm-ledger-number">{value.toLocaleString("es-CO")}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="nx-crm-directory" aria-label="Directorio de clientes">
        <div className="nx-crm-directory-heading">
          <div className="nx-crm-directory-heading-copy">
            <span className="nx-crm-section-eyebrow">AGENDA COMERCIAL</span>
            <h2>Directorio de clientes</h2>
            <p>Consulta y administra las fichas de tus clientes mayoristas.</p>
          </div>
          <span className="nx-crm-visible-count">
            {rows.length.toLocaleString("es-CO")} {rows.length === 1 ? "cliente visible" : "clientes visibles"}
          </span>
        </div>
      <div className="nx-clients-filters space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder={t("customer.searchPlaceholder")}
            className="nx-clients-search sm:max-w-xs"
          />
          <Button
            variant={includeInactive ? "default" : "outline"}
            size="sm"
            className="nx-clients-inactive-toggle w-fit"
            aria-pressed={includeInactive}
            onClick={toggleInactive}
          >
            {t("customer.includeInactive")}
          </Button>
        </div>

        <div className="nx-clients-category-tabs flex flex-wrap gap-2" role="group" aria-label="Filtrar clientes por categoría">
          {([undefined, "celulares", "repuestos", "ambos"] as const).map((opcion) => (
            <Button
              key={opcion ?? "todos"}
              type="button"
              size="sm"
              className="nx-clients-filter"
              aria-pressed={categoriaFiltro === opcion}
              aria-label={opcion ? t(`customerCat.${opcion}Corto`) : t("customer.filterAll")}
              variant="outline"
              onClick={() => setCategoriaFiltro(opcion)}
            >
              {opcion ? t(`customerCat.${opcion}Corto`) : t("customer.filterAll")}
              <span className="nx-clients-filter-count" aria-hidden="true">
                {opcion ? categoryCounts[opcion] : categoryCounts.todos}
              </span>
            </Button>
          ))}
        </div>
      </div>

      <DataTable
        className="nx-clients-table"
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
          <div className="nx-clients-mobile-card space-y-3">
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
              <div className="nx-clients-name-cell">
                <span className="nx-clients-avatar" aria-hidden="true">
                  {customer.name.trim().split(/\s+/).slice(0, 2).map((word) => word[0] ?? "").join("").toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{customer.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {customer.contactName ?? "—"}
                  </p>
                </div>
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
              <span className="nx-clients-order-count font-tabular text-sm">{ordersOf(customer.id)}</span>
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
                    <Button size="sm" variant="ghost" className="nx-clients-edit-btn" aria-label={`${t("common.edit")}: ${customer.name}`}>
                      <PencilLine />
                    </Button>
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="nx-clients-state-btn"
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
      </section>
    </div>
  );
};

export default Clientes;
