import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { usePermissions } from "@/hooks/use-permissions";

/**
 * La recepción de compras solo se registra en la sede principal.
 * El servidor aplica la misma regla mediante RLS; la UI nunca es autoridad.
 */
export const RequireSupplierReception = ({ children }: { children: ReactNode }) => {
  const { role } = usePermissions();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    setAllowed(null);

    if (role !== "admin" && role !== "bodeguero") {
      setAllowed(false);
      return () => { active = false; };
    }

    void import("@/integrations/supabase/client")
      .then(({ supabase }) => supabase.rpc("nexora_supplier_reception_access"))
      .then(({ data, error }) => {
        if (active) setAllowed(!error && data === true);
      })
      .catch(() => { if (active) setAllowed(false); });

    return () => { active = false; };
  }, [role]);

  if (allowed === null) {
    return <p role="status" className="p-6 text-sm text-muted-foreground">
      Verificando autorización de recepción en sede principal...
    </p>;
  }

  if (!allowed) {
    return <section className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Recepción exclusiva de la sede principal</h1>
      <p className="text-sm text-muted-foreground">
        Las compras de proveedores solo se reciben en Bodega 6A mediante un
        Administrador o un Bodeguero asignado a esa sede. Tu sesión no tiene
        autorización para registrar esta recepción.
      </p>
      <Link to="/panel" className="text-sm font-medium text-primary underline">
        Volver al panel
      </Link>
    </section>;
  }
  return <>{children}</>;
};
