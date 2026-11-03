import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { toast } from "sonner";
import { TrasladosMultisedePanel } from "@/pages/administracion/TrasladosMultisedePanel";
import { listNexoraNetwork, type NexoraSite } from "@/lib/nexora-sites";

export const Traslados = () => {
  const [sites, setSites] = useState<NexoraSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const network = await listNexoraNetwork();
      setSites(network.sites);
    } catch (error) {
      setFailed(true);
      toast.error(error instanceof Error ? error.message : "No fue posible consultar las sedes autorizadas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Traslados entre sedes"
        description="Manifiestos, despacho, recepción física y retorno de faltantes según las rutas del Plan Maestro V4."
      />
      {loading ? (
        <p role="status" className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Consultando sedes y permisos...
        </p>
      ) : failed ? (
        <div className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">No fue posible cargar la red de sedes con tu sesión actual.</p>
          <button type="button" className="mt-3 text-sm font-semibold text-primary underline" onClick={() => void load()}>
            Volver a intentar
          </button>
        </div>
      ) : (
        <TrasladosMultisedePanel sites={sites} />
      )}
    </div>
  );
};

export default Traslados;
