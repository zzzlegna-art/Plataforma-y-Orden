import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  PackagePlus,
  ScanLine,
  Settings,
  Boxes,
  ShieldCheck,
  Store,
  Truck,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "@/lib/permissions";

export interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  permission: Permission;
  /** Visible en la barra inferior del móvil. */
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: "/mi-sede",
    labelKey: "nav.mySite",
    icon: Store,
    permission: "workspace.view",
    primary: true,
  },
  {
    to: "/panel",
    labelKey: "nav.dashboard",
    icon: LayoutDashboard,
    permission: "dashboard.view",
    primary: true,
  },
  {
    to: "/recepcion",
    labelKey: "nav.receptions",
    icon: PackagePlus,
    permission: "receptions.manage",
    primary: true,
  },
  {
    to: "/traslados",
    labelKey: "nav.transfers",
    icon: Truck,
    permission: "receptions.manage",
  },
  {
    to: "/inventario",
    labelKey: "nav.inventory",
    icon: Boxes,
    permission: "inventory.view",
    primary: true,
  },
  {
    to: "/seriales",
    labelKey: "nav.units",
    icon: ScanLine,
    permission: "inventory.view",
  },
  {
    to: "/pedidos",
    labelKey: "nav.orders",
    icon: ClipboardList,
    permission: "orders.manage",
    primary: true,
  },
  {
    to: "/clientes",
    labelKey: "nav.customers",
    icon: Building2,
    permission: "customers.manage",
  },
  {
    to: "/garantias",
    labelKey: "nav.warranties",
    icon: ShieldCheck,
    permission: "warranties.manage",
    primary: true,
  },
  {
    to: "/administracion",
    labelKey: "nav.admin",
    icon: Settings,
    permission: "receptions.manage",
  },
];
