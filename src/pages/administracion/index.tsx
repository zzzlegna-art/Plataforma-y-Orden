import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/use-permissions";
import Proveedores from "../proveedores";
import { AuditTab } from "./AuditTab";
import { CatalogsTab } from "./CatalogsTab";
import { DataTab } from "./DataTab";
import { UsersTab } from "./UsersTab";

/**
 * Administración unificada. Personal de bodega administra proveedores sin acceder
 * a cuentas, catálogos, auditoría o configuración reservados al administrador.
 */
const Administracion = () => {
  const { t } = useTranslation();
  const { isAdmin } = usePermissions();
  const [params, setParams] = useSearchParams();
  const selected = params.get("tab");
  const validTabs = isAdmin
    ? ["users", "catalogs", "suppliers", "audit", "data"]
    : ["suppliers"];
  const activeTab = selected && validTabs.includes(selected)
    ? selected
    : isAdmin ? "users" : "suppliers";

  return (
    <div className="nx-management nx-admin space-y-5 stagger">
      <PageHeader
        title={t("admin.title")}
        description={isAdmin ? t("admin.subtitle") : "Gestiona los proveedores que abastecen las recepciones."}
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          next.set("tab", value);
          setParams(next, { replace: true });
        }}
        className="space-y-4"
      >
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-auto">
          {isAdmin ? <TabsTrigger value="users">{t("admin.tabUsers")}</TabsTrigger> : null}
          {isAdmin ? <TabsTrigger value="catalogs">{t("admin.tabCatalogs")}</TabsTrigger> : null}
          <TabsTrigger value="suppliers">{t("admin.tabSuppliers")}</TabsTrigger>
          {isAdmin ? <TabsTrigger value="audit">{t("admin.tabAudit")}</TabsTrigger> : null}
          {isAdmin ? <TabsTrigger value="data">{t("admin.tabData")}</TabsTrigger> : null}
        </TabsList>

        {isAdmin ? (
          <>
            <TabsContent value="users"><UsersTab /></TabsContent>
            <TabsContent value="catalogs"><CatalogsTab /></TabsContent>
            <TabsContent value="audit"><AuditTab /></TabsContent>
            <TabsContent value="data"><DataTab /></TabsContent>
          </>
        ) : null}
        <TabsContent value="suppliers"><Proveedores embedded /></TabsContent>
      </Tabs>
    </div>
  );
};

export default Administracion;
