import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveSupplier, type Supplier, type SupplierInput } from "@/lib/suppliers";

const EMPTY: SupplierInput = {
  name: "", taxId: "", contactName: "", phone: "",
  email: "", address: "", notes: "", isActive: true,
};

/** Crear proveedores desde su directorio o sin abandonar una recepción. */
export const SupplierFormDialog = ({
  trigger, supplier, onSaved,
}: {
  trigger: ReactNode;
  supplier?: Supplier;
  onSaved?: (saved: Supplier) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SupplierInput>(EMPTY);
  useEffect(() => {
    if (open) setForm(supplier ? { ...supplier } : { ...EMPTY });
  }, [open, supplier]);

  const update = (field: keyof SupplierInput, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const save = async () => {
    if (saving || !form.name.trim()) return;
    setSaving(true);
    try {
      const result = await saveSupplier(form, supplier?.id);
      toast.success(supplier ? "Proveedor actualizado" : "Proveedor registrado");
      onSaved?.(result);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el proveedor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{supplier ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
          <DialogDescription>
            Registra a quien suministra mercancía a Nexora. Después podrás seleccionarlo en una recepción.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="supplier-name">Nombre o razón social *</Label>
            <Input id="supplier-name" maxLength={150} autoComplete="organization"
              value={form.name} onChange={(e) => update("name", e.target.value)}
              placeholder="Ej. Distribuidora de repuestos" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplier-tax-id">NIT / Identificación</Label>
            <Input id="supplier-tax-id" maxLength={40} value={form.taxId ?? ""}
              onChange={(e) => update("taxId", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplier-contact">Persona de contacto</Label>
            <Input id="supplier-contact" maxLength={120} value={form.contactName ?? ""}
              onChange={(e) => update("contactName", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplier-phone">Teléfono</Label>
            <Input id="supplier-phone" type="tel" maxLength={35} value={form.phone ?? ""}
              onChange={(e) => update("phone", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supplier-email">Correo</Label>
            <Input id="supplier-email" type="email" maxLength={160} value={form.email ?? ""}
              onChange={(e) => update("email", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="supplier-address">Dirección</Label>
            <Input id="supplier-address" maxLength={250} value={form.address ?? ""}
              onChange={(e) => update("address", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="supplier-notes">Notas</Label>
            <Textarea id="supplier-notes" rows={2} maxLength={1000} value={form.notes ?? ""}
              onChange={(e) => update("notes", e.target.value)} />
          </div>
          {supplier ? (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.isActive}
                onChange={(e) => update("isActive", e.target.checked)} />
              Proveedor activo (disponible para nuevas recepciones)
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={saving || !form.name.trim()} onClick={() => void save()}>
            {saving ? "Guardando..." : supplier ? "Guardar cambios" : "Crear proveedor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
