import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRunAction } from "@/hooks/use-run-action";
import { createCustomer, updateCustomer } from "@/lib/actions/customers";
import type { Customer, CustomerCategoriaMayorista } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORIAS: CustomerCategoriaMayorista[] = ["celulares", "repuestos", "ambos"];

const EMPTY = {
  name: "",
  taxId: "",
  contactName: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
  isActive: true,
  categoriaMayorista: "ambos" as CustomerCategoriaMayorista,
};

/** Alta y edición de clientes mayoristas. */
export const CustomerFormDialog = ({
  trigger,
  customer,
}: {
  trigger: React.ReactNode;
  customer?: Customer;
}) => {
  const { t } = useTranslation();
  const runAction = useRunAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      customer
        ? {
            name: customer.name,
            taxId: customer.taxId ?? "",
            contactName: customer.contactName ?? "",
            email: customer.email ?? "",
            phone: customer.phone ?? "",
            address: customer.address ?? "",
            notes: customer.notes ?? "",
            isActive: customer.isActive,
            categoriaMayorista: customer.categoriaMayorista ?? "ambos",
          }
        : EMPTY,
    );
  }, [open, customer]);

  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await runAction(
        (db, actor) =>
          customer
            ? updateCustomer(db, actor, { ...form, id: customer.id })
            : createCustomer(db, actor, form),
        {
          success: customer ? "customer.updated" : "customer.created",
          key: `guardar-cliente:${customer?.id ?? "nuevo"}`,
        },
      );
      if (result) setOpen(false);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!savingRef.current) setOpen(next); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto pr-0 sm:max-w-lg">
        <DialogHeader className="pr-6">
          <DialogTitle>{customer ? t("customer.editTitle") : t("customer.createTitle")}</DialogTitle>
          <DialogDescription>{t("customer.formDescription")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 pr-6 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customerName">{t("customer.name")}</Label>
            <Input
              id="customerName"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="taxId">{t("customer.taxId")}</Label>
            <Input
              id="taxId"
              value={form.taxId}
              onChange={(event) => setForm({ ...form, taxId: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactName">{t("customer.contactName")}</Label>
            <Input
              id="contactName"
              value={form.contactName}
              onChange={(event) => setForm({ ...form, contactName: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerEmail">{t("customer.email")}</Label>
            <Input
              id="customerEmail"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerPhone">{t("customer.phone")}</Label>
            <Input
              id="customerPhone"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("customer.categoria")}</Label>
            <p className="text-xs text-muted-foreground">{t("customer.categoriaHint")}</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIAS.map((opcion) => (
                <button
                  key={opcion}
                  type="button"
                  onClick={() => setForm({ ...form, categoriaMayorista: opcion })}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    form.categoriaMayorista === opcion
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent",
                  )}
                >
                  {t(`customerCat.${opcion}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customerAddress">{t("customer.address")}</Label>
            <Input
              id="customerAddress"
              value={form.address}
              onChange={(event) => setForm({ ...form, address: event.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customerNotes">{t("common.notes")}</Label>
            <Textarea
              id="customerNotes"
              rows={2}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2 sm:col-span-2">
            <Label htmlFor="customerActive" className="text-sm">
              {t("common.active")}
            </Label>
            <Switch
              id="customerActive"
              checked={form.isActive}
              onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
            />
          </div>
        </div>

        <DialogFooter className="pr-6">
          <Button variant="outline" type="button" disabled={saving} onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" loading={saving} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
