import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, PencilLine, Plus, RefreshCw, Search } from "lucide-react";
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

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSuppliers(await listSuppliers());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron cargar los proveedores");
    } finally {
      setLoading(false);
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
    try {
      await setSupplierActive(supplier, !supplier.isActive);
      await refresh();
      toast.success(supplier.isActive ? "Proveedor desactivado" : "Proveedor reactivado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el proveedor");
    }
  };

  return (
    <div className="space-y-5">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
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

      {!loading && suppliers.length > 0 ? <SupplierQualityChart suppliers={suppliers} /> : null}

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((supplier) => (
            <article key={supplier.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="break-words font-semibold">{supplier.name}</h2>
                    <p className="text-xs text-muted-foreground">{supplier.taxId || "Sin NIT registrado"}</p>
                  </div>
                </div>
                <span className={supplier.isActive
                  ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600"
                  : "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"}>
                  {supplier.isActive ? "Activo" : "Inactivo"}
                </span>
              </div>
              <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                {supplier.contactName ? <p>Contacto: {supplier.contactName}</p> : null}
                {supplier.phone ? <p>Tel: {supplier.phone}</p> : null}
                {supplier.email ? <p className="break-all">{supplier.email}</p> : null}
                {supplier.address ? <p>{supplier.address}</p> : null}
              </div>
              <div className="mt-4 flex gap-2 border-t pt-3">
                <SupplierFormDialog supplier={supplier} onSaved={() => void refresh()}
                  trigger={<Button size="sm" variant="outline" className="flex-1">
                    <PencilLine className="h-4 w-4" /> Editar
                  </Button>} />
                <Button size="sm" variant="ghost" onClick={() => void toggle(supplier)}>
                  {supplier.isActive ? "Desactivar" : "Reactivar"}
                </Button>
              </div>
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
