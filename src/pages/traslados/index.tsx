import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { listNexoraNetwork, type NexoraSite } from "@/lib/nexora-sites";
import { TrasladosMultisedePanel } from "../administracion/TrasladosMultisedePanel";

/** Área operativa, separada de Administración. */
const Traslados = () => {
  const [sites,setSites]=useState<NexoraSite[]>([]);
  const [loading,setLoading]=useState(true);
  const [failed,setFailed]=useState(false);
  const refresh=useCallback(async()=>{
    setLoading(true);setFailed(false);
    try { const data=await listNexoraNetwork();setSites(data.sites); }
    catch(error) {
      setFailed(true);
      toast.error(error instanceof Error?error.message:"No fue posible consultar las sedes.");
    } finally { setLoading(false); }
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  return <section className="space-y-4">
    <PageHeader title="Traslados" description="Envíos y recepciones entre sedes." />
    {loading?<p role="status">Cargando locales...</p>:null}
    {failed?<div role="alert" className="rounded-xl border p-4">
      <p>No se pudo cargar la red de sedes.</p>
      <Button className="mt-3" onClick={()=>void refresh()}>Reintentar</Button>
    </div>:null}
    {!loading&&!failed?<TrasladosMultisedePanel sites={sites}/>:null}
  </section>;
};
export default Traslados;
