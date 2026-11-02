import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, ClipboardList, LockKeyhole, RefreshCw, Save, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listStaffSiteAssignments, type StaffMember } from "@/lib/nexora-staff-sites";
import {
  listRolePlans, saveRolePlan, type RolePlan, type PreparatoryRole,
  rolePlanOptions,
} from "@/lib/nexora-role-plans";

export const RolePlanningPanel = () => {
  const [users, setUsers] = useState<StaffMember[]>([]);
  const [plans, setPlans] = useState<RolePlan[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PreparatoryRole>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const request = useRef(0);
  const busyRef = useRef(false);
  const refresh = useCallback(async () => {
    const call = ++request.current;
    setLoading(true);
    try {
      const [staff, saved] = await Promise.all([
        listStaffSiteAssignments(), listRolePlans(),
      ]);
      if (call !== request.current) return;
      setUsers(staff.users);
      setPlans(saved);
      setDrafts(Object.fromEntries(
        staff.users.map((user) => [
          user.id, saved.find((item) => item.userId === user.id)?.plannedRole ?? "bodeguero",
        ]),
      ));
    } catch (e) {
      if (call === request.current)
        toast.error(e instanceof Error ? e.message : "No fue posible consultar los perfiles.");
    } finally {
      if (call === request.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => { request.current++; };
  }, [refresh]);

  const managed = users.filter((u) => u.role !== "admin");
  const persist = async (user: StaffMember) => {
    if (busyRef.current) return;
    const role = drafts[user.id];
    if (!role) return;
    busyRef.current = true;
    setBusy(user.id);
    try {
      await saveRolePlan(user, role);
      toast.success("Perfil preparado y registrado en auditoría");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el perfil.");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };
  return (
    <section aria-label="Preparación de perfiles por empleado" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-3 text-primary"><Users className="h-5 w-5" /></span>
          <div>
            <h3 className="text-lg font-bold">Asignación de perfiles futuros</h3>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Prepara al Bodeguero, Encargado o Vendedor para cada empleado.
              Las modificaciones se auditan y no alteran la sesión ni los permisos actuales.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading || busy !== null}>
          <RefreshCw className="h-4 w-4" /> Actualizar
        </Button>
      </div>
      <div className="flex items-start gap-3 border-b bg-amber-500/5 px-5 py-4 sm:px-6">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Preparación, no activación:</strong> Encargado y Vendedor
          permanecerán inactivos hasta integrar los controles de acceso al inventario, POS, caja y
          operaciones anteriores. No se crea un acceso con privilegios heredados por accidente.
        </p>
      </div>
      {loading && managed.length === 0 ? (
        <p role="status" className="p-5 text-sm text-muted-foreground">Consultando personal...</p>
      ) : managed.length === 0 ? (
        <div className="p-7 text-sm text-muted-foreground">
          No hay empleados no administradores registrados para preparar.
        </div>
      ) : (
        <div className="divide-y">
          {managed.map((user) => {
            const saved = plans.find((p) => p.userId === user.id);
            const draft = drafts[user.id] ?? "bodeguero";
            const changed = draft !== saved?.plannedRole;
            return (
              <div key={user.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,240px)_auto] sm:items-end sm:px-6">
                <div className="min-w-0">
                  <p className="font-semibold">{user.name}</p>
                  <p className="break-all text-xs text-muted-foreground">{user.email}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    {saved ? <><ClipboardList className="h-3.5 w-3.5" /> Preparado y auditado</>
                      : <><LockKeyhole className="h-3.5 w-3.5" /> Sin asignación preparada</>}
                    {!user.isActive ? " · Cuenta inactiva" : ""}
                  </p>
                </div>
                <div className="space-y-2">
                  <label htmlFor={`role-draft-${user.id}`} className="text-xs font-semibold">Perfil propuesto</label>
                  <select id={`role-draft-${user.id}`} value={draft} disabled={busy !== null || loading || !user.isActive}
                    onChange={(e) => setDrafts((old) => ({
                      ...old, [user.id]: e.target.value as PreparatoryRole,
                    }))}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                    {rolePlanOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <Button disabled={busy !== null || loading || !user.isActive || (!changed && Boolean(saved))}
                  onClick={() => void persist(user)}>
                  {saved && !changed ? <BadgeCheck className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  {saved && !changed ? "Guardado" : "Guardar plan"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
