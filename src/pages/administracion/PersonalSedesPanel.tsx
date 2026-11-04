import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, ClipboardCheck, Link2, LockKeyhole, PackageSearch, Plus, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  canAssignStaffToSite, countLegacyInventoryToReconcile,
  createStaffSiteAssignment, listStaffSiteAssignments, setStaffSiteActive,
  type StaffMember, type StaffSiteAssignment,
} from "@/lib/nexora-staff-sites";
import { siteTypeLabel, type NexoraCity, type NexoraSite } from "@/lib/nexora-sites";
import { listRolePlans, type RolePlan } from "@/lib/nexora-role-plans";

const selectStyle = "flex h-10 min-w-0 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export const PersonalSedesPanel = ({
  cities, sites,
}: {
  cities: readonly NexoraCity[];
  sites: readonly NexoraSite[];
}) => {
  const [people, setPeople] = useState<StaffMember[]>([]);
  const [rolePlans, setRolePlans] = useState<RolePlan[]>([]);
  const [assignments, setAssignments] = useState<StaffSiteAssignment[]>([]);
  const [pendingStock, setPendingStock] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [siteId, setSiteId] = useState("");
  const requestRef = useRef(0);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    const current = ++requestRef.current;
    setLoading(true);
    const [staff, stock, roles] = await Promise.allSettled([
      listStaffSiteAssignments(), countLegacyInventoryToReconcile(), listRolePlans(),
    ]);
    if (current !== requestRef.current) return;

    if (staff.status === "fulfilled") {
      setPeople(staff.value.users);
      setAssignments(staff.value.assignments);
    } else {
      toast.error(staff.reason instanceof Error ? staff.reason.message : "No se pudo cargar el personal.");
    }
    if (roles.status === "fulfilled") {
      setRolePlans(roles.value);
    } else {
      setRolePlans([]);
    }
    if (stock.status === "fulfilled") {
      setPendingStock(stock.value);
    } else {
      setPendingStock(null);
      toast.error("No fue posible consultar el inventario anterior.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    return () => { requestRef.current += 1; };
  }, [refresh]);

  const activeSites = sites.filter((site) => site.isActive);
  const activePeople = people; // Incluye cuentas preparadas e inactivas.
  const roleByUser = new Map(rolePlans.map((p) => [p.userId, p]));
  const roleLabel = (person: StaffMember): string => {
    const plan = roleByUser.get(person.id);
    if (plan && (plan.plannedRole === "encargado" || plan.plannedRole === "vendedor")) {
      return plan.plannedRole === "encargado" ? "Encargado" : "Vendedor";
    }
    return person.role === "admin" ? "Administrador" : "Bodeguero";
  };
  const isPendingWorker = (person: StaffMember) => !person.isActive &&
    (roleByUser.get(person.id)?.plannedRole === "encargado" ||
     roleByUser.get(person.id)?.plannedRole === "vendedor");
  const effectiveUser = activePeople.some((p) => p.id === userId) ? userId : activePeople[0]?.id ?? "";
  const selectedPerson = activePeople.find((p) => p.id === effectiveUser);
  // Los trabajadores pendientes solo pueden vincularse a un LOCAL (no a la principal).
  // Si la lista de roles no cargó, restringimos de igual manera a todo usuario inactivo.
  const siteChoices = activeSites.filter((site) =>
    selectedPerson?.isActive !== false || site.siteType === "local");
  const effectiveSite = siteChoices.some((s) => s.id === siteId) ? siteId : siteChoices[0]?.id ?? "";
  const issue = canAssignStaffToSite(effectiveUser, effectiveSite, people, sites, assignments);
  const siteById = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);
  const cityById = useMemo(() => new Map(cities.map((city) => [city.id, city.name])), [cities]);
  const assignmentsPerUser = (id: string) => assignments.filter((record) => record.userId === id);
  const activeAssignments = assignments.filter((record) => record.isActive).length;

  const execute = async (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await task();
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron guardar los cambios.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const add = () => void execute(async () => {
    await createStaffSiteAssignment(effectiveUser, effectiveSite, people, sites, assignments);
    toast.success("Personal vinculado al punto");
  });

  const toggle = (record: StaffSiteAssignment) => void execute(async () => {
    await setStaffSiteActive(record.id, !record.isActive);
    toast.success(record.isActive ? "Acceso a la sede desvinculado" : "Vínculo reactivado");
  });

  return (
    <section className="space-y-5" aria-label="Personal e inventario por sede">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-primary/10 p-3 text-primary"><Users className="h-5 w-5" /></span>
            <div>
              <h3 className="font-semibold">Personal vinculado a sedes</h3>
              <p className="mt-1 text-sm text-muted-foreground">Asignaciones administrativas y rastreables, sin alterar el rol actual de cada empleado.</p>
            </div>
          </div>
          <div className="mt-5 flex items-end justify-between gap-3 border-t pt-4">
            <div>
              <p className="text-3xl font-bold tabular-nums">{activeAssignments}</p>
              <p className="text-xs text-muted-foreground">Vínculos activos</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Solo Administrador
            </span>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-amber-500/10 p-3 text-amber-600"><PackageSearch className="h-5 w-5" /></span>
            <div>
              <h3 className="font-semibold">Inventario histórico de Bodega 6A</h3>
              <p className="mt-1 text-sm text-muted-foreground">Unidades históricas registradas como en bodega. Su procedencia Bodega 6A ya está documentada: no exige repetir el conteo por referencia.</p>
            </div>
          </div>
          <div className="mt-5 flex items-end justify-between gap-3 border-t pt-4">
            <div>
              <p className="text-3xl font-bold tabular-nums">
                {pendingStock === null ? "—" : new Intl.NumberFormat("es-CO").format(pendingStock)}
              </p>
              <p className="text-xs text-muted-foreground">Unidades registradas en bodega, excluyendo las vendidas</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <LockKeyhole className="h-3.5 w-3.5" /> Solo lectura
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
        <p className="flex items-start gap-2">
          <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span><strong className="text-foreground">Inventario protegido:</strong> estas asignaciones no cambian cantidades, disponibilidad, propietarios del IMEI, costos ni accesos operativos. La procedencia de los registros históricos ya pertenece a Bodega 6A; las operaciones nuevas se controlan por local.</span>
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <h3 className="font-semibold">Asignar personal a un punto</h3>
            <p className="mt-1 text-xs text-muted-foreground">Un Encargado o Vendedor pendiente debe tener un único local asignado antes de activarlo. Asignarlo no activa su cuenta.</p>
          </div>
          <Button size="sm" variant="outline" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <label className="text-xs font-semibold" htmlFor="nexora-personal-select">Empleado</label>
            <select id="nexora-personal-select" className={selectStyle} value={effectiveUser}
              disabled={busy || loading || activePeople.length === 0}
              onChange={(event) => setUserId(event.target.value)}>
              {activePeople.length === 0 ? <option value="">Sin empleados registrados</option> : null}
              {activePeople.map((p) => (
                <option value={p.id} key={p.id}>{p.name} · {roleLabel(p)}{isPendingWorker(p) ? " (pendiente)" : ""}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold" htmlFor="nexora-site-assignment-select">Sede</label>
            <select id="nexora-site-assignment-select" className={selectStyle} value={effectiveSite}
              disabled={busy || loading || siteChoices.length === 0}
              onChange={(event) => setSiteId(event.target.value)}>
              {siteChoices.length === 0 ? <option value="">Primero configura un local activo</option> : null}
              {siteChoices.map((site) => (
                <option value={site.id} key={site.id}>{site.name} · {cityById.get(site.cityId) ?? "Ciudad"}</option>
              ))}
            </select>
          </div>
          <Button disabled={busy || loading || Boolean(issue)} onClick={add}>
            <Plus className="h-4 w-4" /> Vincular
          </Button>
        </div>
        {issue && !loading ? <p role="status" className="px-5 pb-4 text-xs text-muted-foreground">{issue}</p> : null}

        <div className="border-t bg-muted/10 px-5 py-4">
          <h4 className="text-sm font-semibold">Distribución de empleados</h4>
        </div>
        {loading && people.length === 0 ? (
          <p role="status" className="p-6 text-sm text-muted-foreground">Cargando empleados y asignaciones...</p>
        ) : people.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No hay personal registrado para vincular.</p>
        ) : (
          <div className="divide-y">
            {people.map((person) => (
              <article key={person.id} className="flex flex-wrap items-start gap-4 p-5 sm:flex-nowrap">
                <span className="rounded-xl bg-primary/10 p-2.5 text-primary"><Users className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h5 className="font-semibold">{person.name}</h5>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase">{roleLabel(person)}</span>
                    {!person.isActive ? <span className="text-xs text-amber-600">{isPendingWorker(person) ? "Pendiente: asignar local y luego activar rol" : "Usuario inactivo"}</span> : null}
                  </div>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{person.email}</p>
                  {assignmentsPerUser(person.id).length === 0 ? (
                    <p className="mt-3 text-xs text-muted-foreground">Todavía no tiene una sede asignada.</p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assignmentsPerUser(person.id).map((record) => {
                        const site = siteById.get(record.siteId);
                        return (
                          <div key={record.id} className="flex max-w-full items-center gap-2 rounded-xl border bg-background px-3 py-2">
                            <Building2 className="h-4 w-4 shrink-0 text-primary" />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold">{site?.name ?? "Punto no encontrado"}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{site ? siteTypeLabel[site.siteType] : "Sin ubicación"} · {record.isActive ? "Vinculado" : "Desvinculado"}</p>
                            </div>
                            <Button variant="outline" size="sm" disabled={busy || (!record.isActive && !site?.isActive)}
                              aria-label={record.isActive ? `Desvincular ${person.name} de ${site?.name ?? "sede"}` : `Reactivar ${person.name} en ${site?.name ?? "sede"}`}
                              onClick={() => toggle(record)}>
                              {record.isActive ? "Desvincular" : "Reactivar"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Asignar un local a una cuenta pendiente NO la activa ni le concede privilegios. Después de asignarla, entra a Roles y permisos para activar al trabajador.
      </p>
    </section>
  );
};
