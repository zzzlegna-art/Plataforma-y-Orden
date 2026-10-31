import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Pencil, Plus, UserCog, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/shared/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ActiveBadge, RoleBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/shared/option-select";
import { supabase } from "@/integrations/supabase/client";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import { updateUser } from "@/lib/actions/users";
import { formatDate } from "@/lib/format";
import type { Role, User } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";

/** Traduce los errores que devuelve la función de gestión de cuentas. */
const traducirGestion = (mensaje: string) => {
  const m = mensaje.toLowerCase();
  if (m.includes("already registered") || m.includes("ya registrado")) {
    return "errors.emailDuplicated";
  }
  if (m.includes("password") || m.includes("clave_corta")) return "errors.passwordTooShort";
  if (m.includes("email_invalido") || m.includes("invalid email")) return "errors.emailInvalid";
  if (m.includes("sin_permiso")) return "errors.forbidden";
  return "errors.unexpected";
};

/** Crea la cuenta con la contraseña elegida y el rol asignado. */
const crearCuenta = async (body: {
  accion: "crear";
  email: string;
  password: string;
  nombre: string;
  rol: Role;
}) => {
  const { data, error } = await supabase.functions.invoke("bodega-gestion-usuarios", { body });
  if (error || !data?.ok) {
    const mensaje = (data as { error?: string } | null)?.error ?? error?.message ?? "";
    return { ok: false, error: traducirGestion(mensaje) };
  }
  return { ok: true };
};

const CreateUserDialog = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("bodeguero");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const save = async () => {
    if (savingRef.current) return;
    if (!fullName.trim()) { toast.error(t("errors.userNameRequired")); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { toast.error(t("errors.emailInvalid")); return; }
    if (password.length < 8) { toast.error(t("errors.passwordTooShort")); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await crearCuenta({
        accion: "crear", email: email.trim(), password, nombre: fullName.trim(), rol: role,
      });
      if (!result.ok) { toast.error(t(result.error)); return; }
      toast.success(t("user.created"));
      setOpen(false);
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("bodeguero");
    } catch {
      toast.error(t("errors.unexpected"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!savingRef.current) setOpen(next); }}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          {t("user.new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("user.createTitle")}</DialogTitle>
          <DialogDescription>{t("user.createDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="userName">{t("user.fullName")}</Label>
            <Input
              id="userName"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="userEmail">{t("auth.email")}</Label>
            <Input
              id="userEmail"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="userPassword">{t("auth.password")}</Label>
            <Input
              id="userPassword"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("user.passwordHint")}</p>
          </div>
          <div className="space-y-2">
            <Label>{t("user.role")}</Label>
            <OptionSelect
              value={role}
              onChange={(value) => setRole(value === "admin" ? "admin" : "bodeguero")}
              options={[
                { value: "admin", label: t("role.admin") },
                { value: "bodeguero", label: t("role.bodeguero") },
              ]}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" disabled={saving} onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" loading={saving} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ResetPasswordDialog = ({ user }: { user: User }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const save = async () => {
    if (savingRef.current) return;
    if (password.length < 8) { toast.error(t("errors.passwordTooShort")); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("bodega-gestion-usuarios", {
        body: { accion: "clave", userId: user.id, password },
      });
      if (error || !data?.ok) {
        const mensaje = (data as { error?: string } | null)?.error ?? error?.message ?? "";
        toast.error(t(traducirGestion(mensaje)));
        return;
      }
      toast.success(t("user.passwordReset"));
      setOpen(false);
      setPassword("");
    } catch {
      toast.error(t("errors.unexpected"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!savingRef.current) setOpen(next); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="whitespace-nowrap">
          <KeyRound />
          {t("user.resetPassword")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("user.resetPasswordTitle")}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="newPassword">{t("user.newPassword")}</Label>
          <Input
            id="newPassword"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("user.passwordHint")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" disabled={saving} onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" loading={saving} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Editar un usuario: hoy solo el rol, en un diálogo (antes eran dos botones de un clic). */
const EditUserDialog = ({ user, onSave }: { user: User; onSave: (role: Role) => Promise<unknown> }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(user.role);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await onSave(role);
      if (result !== null && result !== undefined) setOpen(false);
    } catch {
      toast.error(t("errors.unexpected"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (savingRef.current) return;
        setOpen(next);
        if (next) setRole(user.role);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil />
          {t("common.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("user.editTitle")}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>{t("user.role")}</Label>
          <OptionSelect
            value={role}
            onChange={(value) => setRole(value === "admin" ? "admin" : "bodeguero")}
            options={[
              { value: "admin", label: t("role.admin") },
              { value: "bodeguero", label: t("role.bodeguero") },
            ]}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" disabled={saving} onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" loading={saving} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Gestión del personal. El administrador crea cada cuenta con su correo,
 * contraseña y rol; también puede restablecer contraseñas y cambiar estados.
 */
export const UsersTab = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const { user: currentUser } = useAuth();
  const runAction = useRunAction();

  const rows = db.users.slice().sort((a, b) => a.fullName.localeCompare(b.fullName));

  const changeRole = (target: User, role: Role) =>
    runAction((db2, actor) => updateUser(db2, actor, { id: target.id, role }), {
      success: "user.updated",
      key: `usuario-rol:${target.id}`,
    });

  const toggleActive = (target: User) =>
    void runAction(
      (db2, actor) => updateUser(db2, actor, { id: target.id, isActive: !target.isActive }),
      { success: "user.updated", key: `usuario-activo:${target.id}` },
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-xl text-sm text-muted-foreground">{t("user.tabDescription")}</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-start gap-2 rounded-lg border bg-card p-3 text-xs text-muted-foreground sm:max-w-xs">
            <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>{t("user.inviteHint")}</p>
          </div>
          <CreateUserDialog />
        </div>
      </div>

      <DataTable
        rows={rows}
        rowKey={(user) => user.id}
        emptyTitle={t("user.emptyTitle")}
        emptyDescription={t("user.emptyDescription")}
        emptyIcon={UserCog}
        renderCard={(user) => (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{user.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <ActiveBadge isActive={user.isActive} />
            </div>
            <div className="flex items-center gap-2">
              <RoleBadge role={user.role} />
              {user.id === currentUser?.id ? (
                <span className="text-xs text-muted-foreground">{t("user.itsYou")}</span>
              ) : null}
            </div>
            {user.id === currentUser?.id ? null : (
              <div className="flex flex-wrap gap-2">
                <EditUserDialog user={user} onSave={(role) => changeRole(user, role)} />
                <ResetPasswordDialog user={user} />
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="ghost">
                      {user.isActive ? t("common.deactivate") : t("common.activate")}
                    </Button>
                  }
                  title={user.isActive ? t("user.deactivateTitle") : t("user.activateTitle")}
                  description={t("user.toggleDescription")}
                  destructive={user.isActive}
                  onConfirm={() => toggleActive(user)}
                />
              </div>
            )}
          </div>
        )}
        columns={[
          {
            key: "name",
            header: t("user.fullName"),
            cell: (user) => (
              <div className="min-w-0">
                <p className="truncate font-medium">{user.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
            ),
          },
          {
            key: "role",
            header: t("user.role"),
            cell: (user) => <RoleBadge role={user.role} />,
          },
          {
            key: "status",
            header: t("common.status"),
            cell: (user) => <ActiveBadge isActive={user.isActive} />,
          },
          {
            key: "created",
            header: t("user.createdAt"),
            cell: (user) => (
              <span className="text-sm text-muted-foreground">{formatDate(user.createdAt)}</span>
            ),
          },
          {
            key: "actions",
            header: t("common.actions"),
            align: "right",
            cell: (user) =>
              user.id === currentUser?.id ? (
                <span className="text-xs text-muted-foreground">{t("user.itsYou")}</span>
              ) : (
                <div className="flex flex-wrap justify-end gap-1">
                  <EditUserDialog user={user} onSave={(role) => changeRole(user, role)} />
                  <ResetPasswordDialog user={user} />
                  <ConfirmDialog
                    trigger={
                      <Button size="sm" variant="ghost" className="whitespace-nowrap">
                        {user.isActive ? t("common.deactivate") : t("common.activate")}
                      </Button>
                    }
                    title={user.isActive ? t("user.deactivateTitle") : t("user.activateTitle")}
                    description={t("user.toggleDescription")}
                    destructive={user.isActive}
                    onConfirm={() => toggleActive(user)}
                  />
                </div>
              ),
          },
        ]}
      />
    </div>
  );
};
