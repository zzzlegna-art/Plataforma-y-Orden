import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type {
  OrderStatus,
  Role,
  UnitCondition,
  UnitStatus,
  WarrantyStatus,
} from "@/lib/types";

type Tone = "neutral" | "primary" | "success" | "warning" | "info" | "destructive";

const TONES: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  primary: "border-transparent bg-primary/12 text-primary",
  success: "border-transparent bg-success/15 text-success",
  warning: "border-transparent bg-warning/15 text-warning",
  info: "border-transparent bg-info/15 text-info",
  destructive: "border-transparent bg-destructive/15 text-destructive",
};

export const Badge = ({
  tone = "neutral",
  label,
  className,
  withDot = true,
}: {
  tone?: Tone;
  label: string;
  className?: string;
  withDot?: boolean;
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-300 motion-reduce:transition-none",
      TONES[tone],
      className,
    )}
  >
    {withDot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
    {label}
  </span>
);

const UNIT_TONES: Record<UnitStatus, Tone> = {
  en_bodega: "success",
  en_local: "success",
  vendido: "neutral",
  en_reparacion: "warning",
  defectuoso: "destructive",
  en_transito: "info",
  entregado_garantia: "primary",
  liberado: "neutral",
};

export const UnitStatusBadge = ({ status }: { status: UnitStatus }) => {
  const { t } = useTranslation();
  return <Badge tone={UNIT_TONES[status]} label={t(`unitStatus.${status}`)} />;
};

const ORDER_TONES: Record<OrderStatus, Tone> = {
  en_preparacion: "info",
  preparado: "warning",
  despachado: "success",
  cancelado: "destructive",
};

export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => {
  const { t } = useTranslation();
  return <Badge tone={ORDER_TONES[status]} label={t(`orderStatus.${status}`)} />;
};

const WARRANTY_TONES: Record<WarrantyStatus, Tone> = {
  recibido: "info",
  en_servicio_tecnico: "warning",
  reenvio_pendiente: "primary",
  entregado: "success",
  devuelto: "neutral",
};

export const WarrantyStatusBadge = ({ status }: { status: WarrantyStatus }) => {
  const { t } = useTranslation();
  return <Badge tone={WARRANTY_TONES[status]} label={t(`warrantyStatus.${status}`)} />;
};

export const ConditionBadge = ({ condition }: { condition: UnitCondition }) => {
  const { t } = useTranslation();
  return (
    <Badge
      tone={condition === "nuevo" ? "primary" : "neutral"}
      label={t(`condition.${condition}`)}
    />
  );
};

export const RoleBadge = ({ role }: { role: Role }) => {
  const { t } = useTranslation();
  return <Badge tone={role === "admin" ? "primary" : "neutral"} label={t(`role.${role}`)} />;
};

export const ActiveBadge = ({ isActive }: { isActive: boolean }) => {
  const { t } = useTranslation();
  return (
    <Badge
      tone={isActive ? "success" : "neutral"}
      label={t(isActive ? "common.active" : "common.inactive")}
    />
  );
};

export const CustomerCategoriaBadge = ({ categoria }: { categoria?: "celulares" | "repuestos" | "ambos" }) => {
  const { t } = useTranslation();
  if (!categoria) return <Badge tone="neutral" label={t("customerCat.ambos")} withDot={false} />;
  return (
    <Badge
      tone={categoria === "repuestos" ? "warning" : categoria === "ambos" ? "primary" : "info"}
      label={t(`customerCat.${categoria}`)}
      withDot={false}
    />
  );
};

export const PendingImeiBadge = () => {
  const { t } = useTranslation();
  return <Badge tone="warning" label={t("unit.pendingImei")} />;
};

export const LowStockBadge = () => {
  const { t } = useTranslation();
  return <Badge tone="warning" label={t("product.lowStock")} />;
};
