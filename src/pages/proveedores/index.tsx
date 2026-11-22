import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, PencilLine, Plus, Power, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { listSuppliers, setSupplierActive, type Supplier } from "@/lib/suppliers";
import { SupplierFormDialog } from "./SupplierFormDialog";
import { SupplierQualityChart } from "./SupplierQualityChart";

/** Directorio de los proveedores que surten las recepciones de mercancía. */
const Proveedores = ({ embedded = false }: { embedded?: boolean }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [busySupplierIds, setBusySupplierIds] = useState<Set<string>>(() => new Set());
  // El ref bloquea el segundo clic inmediatamente, antes de que React actualice el botón.
  const busySupplierIdsRef = useRef(new Set<string>());
  // Una consulta lenta nunca debe sobrescribir una recarga más reciente.
  const latestRefreshRef = useRef(0);

  const refresh = useCallback(async () => {
    const refreshId = ++latestRefreshRef.current;
    setLoading(true);
    try {
      const nextSuppliers = await listSuppliers();
      if (refreshId === latestRefreshRef.current) setSuppliers(nextSuppliers);
    } catch (error) {
      if (refreshId === latestRefreshRef.current) {
        toast.error(error instanceof Error ? error.message : "No se pudieron cargar los proveedores");
      }
    } finally {
      if (refreshId === latestRefreshRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("es");
    return suppliers.filter((supplier) =>
      (showInactive || supplier.isActive) &&
      (!q || [supplier.name, supplier.taxId, supplier.contactName, supplier.phone]
        .some((field) => field?.toLocaleLowerCase("es").includes(q)))
    );
  }, [suppliers, search, showInactive]);

  const toggle = async (supplier: Supplier) => {
    if (busySupplierIdsRef.current.has(supplier.id)) return;
    busySupplierIdsRef.current.add(supplier.id);
    setBusySupplierIds((previous) => new Set(previous).add(supplier.id));
    try {
      await setSupplierActive(supplier, !supplier.isActive);
      await refresh();
      toast.success(supplier.isActive ? "Proveedor desactivado" : "Proveedor reactivado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el proveedor");
    } finally {
      busySupplierIdsRef.current.delete(supplier.id);
      setBusySupplierIds((previous) => {
        const next = new Set(previous);
        next.delete(supplier.id);
        return next;
      });
    }
  };

  return (
    <div className="nx-suppliers-premium nx-supplier-network space-y-5">
      {embedded ? (
        <div className="nx-supplier-directory-head flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Directorio de proveedores</h2>
            <p className="text-sm text-muted-foreground">
              Gestiona las empresas y personas que abastecen tus recepciones.
            </p>
          </div>
          <SupplierFormDialog
            onSaved={() => void refresh()}
            trigger={<Button><Plus className="h-4 w-4" /> Nuevo proveedor</Button>}
          />
        </div>
      ) : (
        <PageHeader
          title="Proveedores"
          description="Registra y administra quienes suministran los productos que recibes en Nexora."
          actions={
            <SupplierFormDialog
              onSaved={() => void refresh()}
              trigger={<Button><Plus className="h-4 w-4" /> Nuevo proveedor</Button>}
            />
          }
        />
      )}

      {!loading ? <SupplierQualityChart suppliers={suppliers} /> : null}

      <div className="nx-supplier-search-bar flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <div className="relative min-w-[190px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Buscar proveedor" className="pl-9" value={search}
            placeholder="Buscar por nombre, NIT o contacto"
            onChange={(event) => setSearch(event.target.value)} />
        </div>
        <Button size="sm" variant={showInactive ? "secondary" : "outline"}
          onClick={() => setShowInactive(!showInactive)}>
          {showInactive ? "Ocultar inactivos" : "Mostrar inactivos"}
        </Button>
        <Button size="icon" variant="outline" aria-label="Actualizar proveedores"
          disabled={loading} onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {loading && suppliers.length === 0 ? (
        <p role="status" className="py-12 text-center text-muted-foreground">Cargando proveedores...</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card px-5 py-12 text-center">
          <Building2 className="mx-auto mb-3 h-9 w-9 text-primary" />
          <h2 className="font-semibold">No hay proveedores para mostrar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea el primero para poder seleccionarlo cuando recibas mercancía.
          </p>
        </div>
      ) : (
        <div className="nx-supplier-cards grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((supplier) => (
            <article key={supplier.id} className="nx-supplier-card nx-supplier-card-clean rounded-xl border bg-card shadow-sm">
              <header className="nx-supplier-card-head">
                <span className="nx-supplier-card-icon" aria-hidden="true"><Building2 className="h-5 w-5" /></span>
                <div className="nx-supplier-card-identity">
                  <h2 className="break-words font-semibold">{supplier.name}</h2>
                  <p className="text-xs text-muted-foreground">{supplier.taxId ? `NIT: ${supplier.taxId}` : "Sin NIT registrado"}</p>
                </div>
                <span className={supplier.isActive
                  ? "nx-supplier-card-status nx-supplier-card-status--active"
                  : "nx-supplier-card-status nx-supplier-card-status--inactive"}>
                  <span aria-hidden="true" className="nx-supplier-card-status-dot" />
                  {supplier.isActive ? "Activo" : "Inactivo"}
                </span>
              </header>
              {(supplier.contactName || supplier.phone || supplier.email || supplier.address) ? (
                <div className="nx-supplier-card-details text-sm text-muted-foreground">
                  {supplier.contactName ? <p><span>Contacto</span>{supplier.contactName}</p> : null}
                  {supplier.phone ? <p><span>Teléfono</span>{supplier.phone}</p> : null}
                  {supplier.email ? <p className="break-all"><span>Correo</span>{supplier.email}</p> : null}
                  {supplier.address ? <p><span>Dirección</span>{supplier.address}</p> : null}
                </div>
              ) : null}
              <footer className="nx-supplier-card-actions">
                <SupplierFormDialog supplier={supplier} onSaved={() => void refresh()}
                  trigger={<Button size="sm" variant="outline" className="nx-supplier-card-edit" disabled={busySupplierIds.has(supplier.id)}>
                    <PencilLine className="h-4 w-4" /> Editar
                  </Button>} />
                <Button size="sm" variant="ghost" className="nx-supplier-card-toggle" loading={busySupplierIds.has(supplier.id)}
                  onClick={() => void toggle(supplier)}>
                  <Power className="h-3.5 w-3.5" />
                  {supplier.isActive ? "Desactivar" : "Reactivar"}
                </Button>
              </footer>
            </article>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {visible.length} proveedores visibles · Los proveedores desactivados conservan su relación con recepciones anteriores.
      </p>
    </div>
  );
};

export default Proveedores;
