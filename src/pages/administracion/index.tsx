import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuditTab } from "./AuditTab";
import { CatalogsTab } from "./CatalogsTab";
import { DataTab } from "./DataTab";
import { UsersTab } from "./UsersTab";

/** Administración: usuarios, catálogos, auditoría y datos. */
const Administracion = () => {
  const { t } = useTranslation();

  return (
    <div className="nx-management nx-admin space-y-5 stagger">
      <PageHeader title={t("admin.title")} description={t("admin.subtitle")} />

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1 sm:w-auto">
          <TabsTrigger value="users">{t("admin.tabUsers")}</TabsTrigger>
          <TabsTrigger value="catalogs">{t("admin.tabCatalogs")}</TabsTrigger>
          <TabsTrigger value="audit">{t("admin.tabAudit")}</TabsTrigger>
          <TabsTrigger value="data">{t("admin.tabData")}</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="catalogs">
          <CatalogsTab />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab />
        </TabsContent>
        <TabsContent value="data">
          <DataTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Administracion;
