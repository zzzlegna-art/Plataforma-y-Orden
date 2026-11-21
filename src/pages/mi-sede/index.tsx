import { useCallback,useEffect,useRef,useState } from "react";
import { Building2,LockKeyhole,RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useApp } from "@/hooks/use-app";
import { getWorkerSnapshot,type WorkerSnapshot } from "@/lib/nexora-worker";

/** Portal restringido: muestra únicamente información operativa de Bodega 6A. */
export const MiSede=()=>{
  const {user,role}=useApp();
  const [snapshot,setSnapshot]=useState<WorkerSnapshot|null>(null);
  const [loading,setLoading]=useState(true);
  const mounted=useRef(true);
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const next=await getWorkerSnapshot();
      if(mounted.current)setSnapshot(next);
    }catch(error){
      if(mounted.current){
        setSnapshot(null);
        toast.error(error instanceof Error?error.message:"La sesión de Bodega 6A ya no está disponible.");
      }
    }finally{if(mounted.current)setLoading(false);}
  },[]);
  useEffect(()=>{
    mounted.current=true;
    void refresh();
    return()=>{mounted.current=false;};
  },[refresh]);
  return <section className="mx-auto max-w-4xl space-y-5" aria-label="Operaciones de Bodega 6A">
    <header className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Building2 className="size-6 text-primary"/>
        <div>
          <h1 className="text-2xl font-bold">Mi bodega</h1>
          <p className="text-sm text-muted-foreground">
            {user?.fullName} · {role==="encargado"?"Encargado":"Operador"}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Operación de Bodega 6A: {snapshot?.siteName??"Bodega 6A"}.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline"><Link to="/inventario">Inventario</Link></Button>
        <Button size="sm" variant="outline" disabled={loading}
          onClick={()=>void refresh()}><RefreshCw className="size-4"/> Actualizar</Button>
      </div>
    </header>
    {loading?<p role="status">Verificando acceso a Bodega 6A...</p>:null}
    {!loading&&!snapshot?<div role="alert" className="rounded-xl border p-4 text-sm">
      <LockKeyhole className="mr-2 inline size-4"/> El servidor no confirmó tu acceso a Bodega 6A.
      Comunícate con el Administrador.
    </div>:null}
    {snapshot&&<div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border p-4">
        <p className="text-xs text-muted-foreground">Bodega autorizada</p>
        <p className="mt-1 font-semibold">{snapshot.siteName}</p>
      </div>
      <div className="rounded-xl border p-4">
        <p className="text-xs text-muted-foreground">Equipos asignados</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{snapshot.assignedUnits}</p>
      </div>
    </div>}
  </section>;
};
export default MiSede;
