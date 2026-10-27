import { useEffect, useState, type ReactNode } from "react";
import { useRunAction } from "@/hooks/use-run-action";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { updateReceptionSupplier } from "@/lib/actions/receptions";
import type { Reception } from "@/lib/types";
import type { Supplier } from "@/lib/suppliers";

/**
 * Permite corregir el proveedor sin reabrir una recepción confirmada ni
 * modificar sus seriales, movimientos, existencias o fecha de ingreso.
 */
export const ReceptionSupplierDialog = ({
  reception, suppliers, trigger,
}: {
  reception: Reception;
  suppliers: Supplier[];
  trigger: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState(reception.supplierId ?? "");
  const runAction = useRunAction();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setSupplierId(reception.supplierId ?? "");
  }, [open, reception.supplierId]);

  const save = async () => {
    if (saving) return;
    const selected = supplierId ? suppliers.find((supplier) => supplier.id === supplierId) : undefined;
    if (supplierId && !selected) return; // Nunca guardar un ID huérfano.
    setSaving(true);
    try {
      const result = await runAction(
        (db, actor) => updateReceptionSupplier(db, actor, { id: reception.id, supplierId }),
        { success: "receptions.supplierUpdated", key: `supplier-${reception.id}`, deferOptimistic: true },
      );
      if (result) setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const options = suppliers.filter((supplier) => supplier.isActive || supplier.id === reception.supplierId);
  const name = suppliers.find((supplier) => supplier.id === reception.supplierId)?.name;

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Proveedor de {reception.code}</DialogTitle>
          <DialogDescription>
            Asigna o corrige el proveedor aunque la recepción ya esté confirmada.
            Todos sus seriales quedarán asociados automáticamente mediante la recepción original.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="supplier-assignment">Proveedor</Label>
            <select id="supplier-assignment" value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              disabled={saving}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              <option value="">Sin proveedor registrado</option>
              {options.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}{supplier.isActive ? "" : " (inactivo)"}
                </option>
              ))}
            </select>
          </div>
          {reception.supplierId && !name ? (
            <p className="text-xs text-destructive">
              El proveedor anterior no se pudo consultar. Verifica su registro antes de guardar.
            </p>
          ) : null}
          <p className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            Esta edición conserva los IMEI, seriales, cantidades, precios, movimientos y estado de la recepción.
            El cambio queda registrado en la auditoría.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="button" disabled={saving || Boolean(supplierId && !suppliers.some((s) => s.id === supplierId))}
            onClick={() => void save()}>
            {saving ? "Guardando..." : "Guardar proveedor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
