import { useMemo, useState, type ReactNode } from "react";
import { RolePlanningPanel } from "./RolePlanningPanel";
import {
  Building2, Check, ClipboardCheck, LockKeyhole,
  PackageCheck, ShieldCheck, ShoppingBag, Store, Warehouse,
} from "lucide-react";

import {
  MULTISITE_CAPABILITIES, MULTISITE_ROLES, canMultisite,
  type MultisiteRole,
} from "@/lib/nexora-role-policy";

const ROLE_DETAILS: Record<MultisiteRole, {
  title: string;
  description: string;
  icon: typeof ShieldCheck;
}> = {
  admin: {
    title: "Administrador",
    description: "Control central, costos, autorizaciones y finanzas.",
    icon: ShieldCheck,
  },
  bodeguero: {
    title: "Bodeguero",
    description: "Recepciones, inventario físico y garantías.",
    icon: Warehouse,
  },
  encargado: {
    title: "Encargado",
    description: "Operación del local, caja y reportes propios.",
    icon: Store,
  },
  vendedor: {
    title: "Vendedor",
    description: "Consulta de costos e inventario, traslados y venta.",
    icon: ShoppingBag,
  },
};

const CATEGORY_ICONS = {
  "Inventario": PackageCheck,
  "Traslados": Building2,
  "Compras": ClipboardCheck,
  "Ventas y caja": ShoppingBag,
  "Finanzas": LockKeyhole,
} as const;

/**
 * Vista de la matriz aprobada para Nexora Multisede 2.0.
 * Solo consulta reglas de dominio; no asigna perfiles ni cambia permisos legacy.
 * Los controles efectivos se implementarán en backend/RLS antes de habilitar los roles.
 */
export const RolesTab = () => {
  const [selectedRole, setSelectedRole] = useState<MultisiteRole | "todos">("todos");
  const rolesToShow = selectedRole === "todos" ? MULTISITE_ROLES : [selectedRole];
  const categories = useMemo(
    () => [...new Set(MULTISITE_CAPABILITIES.map((capability) => capability.category))],
    [],
  );
  return (
    <section aria-label="Roles y permisos multisede" className="space-y-6">
      <header>
        <h2 className="text-xl font-semibold">Roles y permisos</h2>
        <p className="mt-1 text-sm text-muted-foreground">Permisos y acceso del personal.</p>
      </header>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">Perfiles de la empresa</h3>
            <p className="text-sm text-muted-foreground">Selecciona un perfil para consultar sus autorizaciones.</p>
          </div>
          <button
            type="button"
            aria-pressed={selectedRole === "todos"}
            onClick={() => setSelectedRole("todos")}
            className="rounded-full border bg-card px-4 py-2 text-xs font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Mostrar todos
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MULTISITE_ROLES.map((role) => {
            const meta = ROLE_DETAILS[role];
            const Icon = meta.icon;
            const count = MULTISITE_CAPABILITIES.filter(({ key }) => canMultisite(role, key)).length;
            return (
              <button
                key={role}
                type="button"
                aria-pressed={selectedRole === role}
                aria-label={`Ver permisos de ${meta.title}`}
                onClick={() => setSelectedRole(role)}
                className={`rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selectedRole === role ? "border-primary bg-primary/[0.05] shadow-sm ring-1 ring-primary/20" : "bg-card"}`}
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h4 className="mt-3 font-semibold">{meta.title}</h4>
                <p className="mt-1 min-h-10 text-xs leading-relaxed text-muted-foreground">{meta.description}</p>
                <p className="mt-3 text-xs font-semibold tabular-nums text-primary">
                  {count} de {MULTISITE_CAPABILITIES.length} permisos
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/15 px-5 py-4">
          <div>
            <h3 className="font-semibold">Matriz operativa aprobada</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedRole === "todos" ? "Comparación de los cuatro roles" : `Permisos del perfil ${ROLE_DETAILS[selectedRole].title}`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Check className="h-4 w-4 text-emerald-600" /> Permitido</span>
            <span className="flex items-center gap-1"><LockKeyhole className="h-3.5 w-3.5" /> Restringido</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                <th scope="col" className="min-w-60 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Función</th>
                {rolesToShow.map((role) => (
                  <th scope="col" key={role} className="min-w-24 px-3 py-3 text-center text-xs font-semibold text-foreground">
                    {ROLE_DETAILS[role].title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const Icon = CATEGORY_ICONS[category];
                return (
                  <FragmentCategory key={category} name={category} Icon={Icon} colSpan={rolesToShow.length + 1}>
                    {MULTISITE_CAPABILITIES.filter((capability) => capability.category === category).map((capability) => (
                      <tr key={capability.key} className="border-b last:border-b-0 hover:bg-muted/10">
                        <th scope="row" className="px-5 py-3 text-left font-normal">
                          <span className="block font-medium">{capability.label}</span>
                          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{capability.description}</span>
                        </th>
                        {rolesToShow.map((role) => (
                          <td key={role} className="px-3 py-3 text-center">
                            {canMultisite(role, capability.key) ? (
                              <span title="Permitido" aria-label={`${ROLE_DETAILS[role].title}: permitido`} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                                <Check className="h-4 w-4" />
                              </span>
                            ) : (
                              <span title="Restringido" aria-label={`${ROLE_DETAILS[role].title}: restringido`} className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                                <LockKeyhole className="h-3.5 w-3.5" />
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </FragmentCategory>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <RolePlanningPanel />


    </section>
  );
};

const FragmentCategory = ({
  name, Icon, colSpan, children,
}: {
  name: string;
  Icon: typeof ShieldCheck;
  colSpan: number;
  children: ReactNode;
}) => (
  <>
    <tr className="border-b bg-muted/35">
      <th colSpan={colSpan} scope="colgroup" className="px-5 py-3 text-left">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em]">
          <Icon className="h-4 w-4 text-primary" /> {name}
        </span>
      </th>
    </tr>
    {children}
  </>
);
