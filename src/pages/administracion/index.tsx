import { useTranslation } from "react-i18next";
import "./administracion-premium.css";
import "./administracion-executive.css";
import "./administracion-catalog-suppliers-v2.css";
import { BookOpenCheck, Building2, Database, FileClock, KeyRound, LayoutGrid, Settings2, ShieldCheck, UsersRound } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/use-permissions";
import Proveedores from "../proveedores";
import { AuditTab } from "./AuditTab";
import { CatalogsTab } from "./CatalogsTab";
import { DataTab } from "./DataTab";
import { UsersTab } from "./UsersTab";
import { RolesTab } from "./RolesTab";

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
    ? ["users", "roles", "catalogs", "suppliers", "audit", "data"]
    : ["suppliers"];
  const activeTab = selected && validTabs.includes(selected)
    ? selected
    : isAdmin ? "users" : "suppliers";

  const sections: Record<string, { title: string; description: string }> = {
    users: { title: "Equipo y usuarios", description: "Directorio de cuentas y asignación de perfiles." },
    roles: { title: "Gobierno de accesos", description: "Consulta los permisos y los perfiles de trabajo." },
    catalogs: { title: "Catálogos maestros", description: "Organiza marcas y tipos de producto." },
    suppliers: { title: "Red de proveedores", description: "Consulta y gestiona las fichas de abastecimiento." },
    audit: { title: "Registro de actividad", description: "Revisa las operaciones registradas en el sistema." },
    data: { title: "Configuración y datos", description: "Datos de empresa y resumen del almacenamiento." },
  };
  const currentSection = sections[activeTab];

  return (
    <div className="nx-management nx-admin nx-admin-executive space-y-5 stagger">
      <header className="nx-admin-masthead">
        <div className="nx-admin-masthead-rail">
          <span><ShieldCheck size={15} aria-hidden="true" /> NEXORA / EXECUTIVE CONTROL OFFICE</span>
          <span>ADMINISTRACIÓN EMPRESARIAL</span>
        </div>
        <div className="nx-admin-page-title">
          <PageHeader
            className="nx-admin-page-copy"
            title={t("admin.title")}
            description={isAdmin ? t("admin.subtitle") : "Gestiona los proveedores que abastecen las recepciones."}
          />
          <span className="nx-admin-masthead-emblem" aria-hidden="true"><Settings2 size={30} /></span>
        </div>
        <div className="nx-admin-masthead-footer">
          <span><span className="nx-admin-status-light" aria-hidden="true" /> ESPACIO DE CONFIGURACIÓN</span>
          <span>{isAdmin ? "VISTA ADMINISTRATIVA" : "DIRECTORIO DE PROVEEDORES"}</span>
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          next.set("tab", value);
          setParams(next, { replace: true });
        }}
        className="nx-admin-workspace"
      >
        <aside className="nx-admin-rail" aria-label="Navegación de administración">
          <div className="nx-admin-rail-heading">
            <LayoutGrid size={20} aria-hidden="true" />
            <div>
              <strong>Espacios de gestión</strong>
              <small>Secciones de NEXORA</small>
            </div>
          </div>
          <TabsList className="nx-admin-nav" aria-label="Secciones administrativas">
            {isAdmin ? <TabsTrigger value="users" aria-label={t("admin.tabUsers")}><UsersRound aria-hidden="true" />{t("admin.tabUsers")}</TabsTrigger> : null}
            {isAdmin ? <TabsTrigger value="roles" aria-label="Roles y permisos"><KeyRound aria-hidden="true" />Roles y permisos</TabsTrigger> : null}
            {isAdmin ? <TabsTrigger value="catalogs" aria-label={t("admin.tabCatalogs")}><BookOpenCheck aria-hidden="true" />{t("admin.tabCatalogs")}</TabsTrigger> : null}
            <TabsTrigger value="suppliers" aria-label={t("admin.tabSuppliers")}><Building2 aria-hidden="true" />{t("admin.tabSuppliers")}</TabsTrigger>
            {isAdmin ? <TabsTrigger value="audit" aria-label={t("admin.tabAudit")}><FileClock aria-hidden="true" />{t("admin.tabAudit")}</TabsTrigger> : null}
            {isAdmin ? <TabsTrigger value="data" aria-label={t("admin.tabData")}><Database aria-hidden="true" />{t("admin.tabData")}</TabsTrigger> : null}
          </TabsList>
          <p className="nx-admin-rail-footnote">Una sección para cada responsabilidad. Los accesos dependen del perfil asignado.</p>
        </aside>

        <section className="nx-admin-workarea" aria-label="Contenido de administración">
          <div className="nx-admin-workarea-head">
            <div>
              <span className="nx-admin-workarea-eyebrow">ÁREA DE TRABAJO / NEXORA</span>
              <h2>{currentSection.title}</h2>
              <p>{currentSection.description}</p>
            </div>
            <span className="nx-admin-workarea-mark" aria-hidden="true"><Settings2 size={21}/></span>
          </div>
          {isAdmin ? (
            <>
              <TabsContent value="users"><UsersTab /></TabsContent>
              <TabsContent value="roles"><RolesTab /></TabsContent>
              <TabsContent value="catalogs"><CatalogsTab /></TabsContent>
              <TabsContent value="audit"><AuditTab /></TabsContent>
              <TabsContent value="data"><DataTab /></TabsContent>
            </>
          ) : null}
          <TabsContent value="suppliers"><Proveedores embedded /></TabsContent>
        </section>
      </Tabs>
    </div>
  );
};

export default Administracion;
