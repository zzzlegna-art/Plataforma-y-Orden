import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, ClipboardList, LockKeyhole, RefreshCw, Save, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { activatePreparedWorker,deactivatePreparedWorker } from "@/lib/nexora-worker";
import { listStaffSiteAssignments, type StaffMember, type StaffSiteAssignment } from "@/lib/nexora-staff-sites";
import {
  listRolePlans, saveRolePlan, type RolePlan, type PreparatoryRole,
  rolePlanOptions,
} from "@/lib/nexora-role-plans";

export const RolePlanningPanel = () => {
  const [users, setUsers] = useState<StaffMember[]>([]);
  const [plans, setPlans] = useState<RolePlan[]>([]);
  const [assignments, setAssignments] = useState<StaffSiteAssignment[]>([]);
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
      setAssignments(staff.assignments);
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
  const changeActivation = async (userId:string,enable:boolean) => {
    if(busyRef.current)return;
    busyRef.current=true;setBusy(userId);
    try{
      const sites=assignments.filter((s)=>s.userId===userId&&s.isActive);
      if(enable){
        if(sites.length!==1)throw new Error("Vincula una única sede local activa al trabajador.");
        await activatePreparedWorker(userId,sites[0].siteId);
        toast.success("Trabajador activado con permisos limitados a su sede.");
      }else{
        await deactivatePreparedWorker(userId);
        toast.success("Acceso operativo del trabajador desactivado.");
      }
      await refresh();
    }catch(e){toast.error(e instanceof Error?e.message:"No pudo actualizarse el acceso.");}
    finally{busyRef.current=false;setBusy(null);}
  };
  return (
    <section aria-label="Preparación de perfiles por empleado" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-3 text-primary"><Users className="h-5 w-5" /></span>
          <div>
            <h3 className="text-lg font-bold">Asignación de perfiles futuros</h3>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Prepara al Bodeguero, Encargado o Vendedor y activa las cuentas de local
              únicamente después de aprobar inventario, sede y límites correspondientes.
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
          <strong className="text-foreground">Activación protegida:</strong> las cuentas nuevas
          permanecen inactivas hasta que el Administrador confirme su única sede y el servidor
          valide el inventario inicial, el rol y los topes de caja cuando correspondan.
          Ningún trabajador hereda los permisos anteriores de Bodeguero.
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
            const assigned = assignments.filter((s)=>s.userId===user.id&&s.isActive);
            const protectedWorker = Boolean(saved &&
              (saved.plannedRole==="encargado"||saved.plannedRole==="vendedor"));
            const readyToAttempt = Boolean(protectedWorker && !user.isActive &&
              !saved?.operationallyEnabled && assigned.length===1);
            return (
              <div key={user.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,240px)_auto] sm:items-end sm:px-6">
                <div className="min-w-0">
                  <p className="font-semibold">{user.name}</p>
                  <p className="break-all text-xs text-muted-foreground">{user.email}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    {saved?.operationallyEnabled ? <><BadgeCheck className="h-3.5 w-3.5" /> Rol operativo activado</>
                      : saved ? <><ClipboardList className="h-3.5 w-3.5" /> Perfil preparado, no activado</>
                      : <><LockKeyhole className="h-3.5 w-3.5" /> Sin asignación preparada</>}
                    {!user.isActive ? " · Cuenta inactiva" : ""}
                    {protectedWorker ? ` · Sedes asignadas: ${assigned.length}` : ""}
                  </p>
                </div>
                <div className="space-y-2">
                  <label htmlFor={`role-draft-${user.id}`} className="text-xs font-semibold">Perfil propuesto</label>
                  <select id={`role-draft-${user.id}`} value={draft}
                    disabled={busy !== null || loading || !user.isActive || Boolean(saved?.operationallyEnabled)}
                    onChange={(e) => setDrafts((old) => ({
                      ...old, [user.id]: e.target.value as PreparatoryRole,
                    }))}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                    {rolePlanOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  {saved?.operationallyEnabled ? (
                    <ConfirmDialog
                      trigger={<Button variant="destructive" disabled={busy!==null}>Desactivar acceso</Button>}
                      title="Desactivar cuenta operativa"
                      description="La persona perderá el acceso a su sede. Los registros anteriores se conservan."
                      destructive
                      onConfirm={()=>void changeActivation(user.id,false)}
                    />
                  ) : readyToAttempt ? (
                    <ConfirmDialog
                      trigger={<Button disabled={busy!==null}>Activar acceso</Button>}
                      title="Activar trabajador del local"
                      description="Supabase verificará inventario inicial, sede, rol y topes. La cuenta no tendrá permisos de Bodeguero."
                      onConfirm={()=>void changeActivation(user.id,true)}
                    />
                  ) : (
                    <Button disabled={busy !== null || loading || !user.isActive ||
                        (!changed && Boolean(saved))}
                      onClick={() => void persist(user)}>
                      {saved && !changed ? <BadgeCheck className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                      {saved && !changed ? "Guardado" : "Guardar plan"}
                    </Button>
                  )}
                  {protectedWorker && !saved?.operationallyEnabled && assigned.length!==1
                    ? <span className="text-xs text-amber-700">Asigna una sede local única antes de activar</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
