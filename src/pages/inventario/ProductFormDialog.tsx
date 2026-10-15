import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { OptionSelect } from "@/components/shared/option-select";
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
import { useStore } from "@/hooks/use-store";
import { createProduct, updateProduct } from "@/lib/actions/catalogs";
import { etiquetaTipoProducto, tiposProductoOrdenados } from "@/lib/products";
import type { Product, ProductCategory } from "@/lib/types";

const EMPTY_FORM = {
  sku: "",
  name: "",
  description: "",
  categoryId: "",
  brandId: "",
  categoria: "",
  price: "0",
  cost: "0",
  minStock: "0",
  isActive: true,
};

/** Alta y edición de productos del inventario. */
export const ProductFormDialog = ({
  trigger,
  product,
  onSaved,
}: {
  trigger: React.ReactNode;
  product?: Product;
  onSaved?: (product: Product) => void;
}) => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      product
        ? {
            sku: product.sku,
            name: product.name,
            description: product.description ?? "",
            categoryId: product.categoryId ?? "",
            brandId: product.brandId ?? "",
            categoria: product.categoria ?? "",
            price: String(product.price),
            cost: String(product.cost),
            minStock: String(product.minStock),
            isActive: product.isActive,
          }
        : EMPTY_FORM,
    );
  }, [open, product]);

  const save = async () => {
    setSaving(true);
    const payload = {
      sku: form.sku,
      name: form.name,
      description: form.description,
      categoryId: form.categoryId || undefined,
      brandId: form.brandId || undefined,
      categoria: (form.categoria || undefined) as ProductCategory | undefined,
      price: Number(form.price),
      cost: Number(form.cost),
      minStock: Number(form.minStock),
      isActive: form.isActive,
    };
    const result = await runAction(
      (db2, actor) =>
        product
          ? updateProduct(db2, actor, { ...payload, id: product.id })
          : createProduct(db2, actor, payload),
      { success: product ? "product.updated" : "product.created" },
    );
    setSaving(false);
    if (result) {
      setOpen(false);
      onSaved?.(result);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? t("product.editTitle") : t("product.createTitle")}</DialogTitle>
          <DialogDescription>{t("product.formDescription")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sku">{t("product.sku")}</Label>
            <Input
              id="sku"
              value={form.sku}
              placeholder={t("product.skuPlaceholder")}
              onChange={(event) => setForm({ ...form, sku: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">{t("product.skuHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">{t("product.name")}</Label>
            <Input
              id="name"
              value={form.name}
              placeholder="iPhone 13 128 GB"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("product.type")}</Label>
            <OptionSelect
              value={form.categoria}
              onChange={(value) => setForm({ ...form, categoria: value })}
              emptyLabel={t("common.none")}
              options={tiposProductoOrdenados(db).map((tipo) => ({
                value: tipo.key,
                label: etiquetaTipoProducto(t, tipo),
              }))}
            />
            <p className="text-xs text-muted-foreground">{t("product.typeHint")}</p>
          </div>
          <div className="space-y-2">
            <Label>{t("product.category")}</Label>
            <OptionSelect
              value={form.categoryId}
              onChange={(value) => setForm({ ...form, categoryId: value })}
              emptyLabel={t("common.none")}
              options={db.categories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("product.brand")}</Label>
            <OptionSelect
              value={form.brandId}
              onChange={(value) => setForm({ ...form, brandId: value })}
              emptyLabel={t("common.none")}
              options={db.brands.map((brand) => ({ value: brand.id, label: brand.name }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">{t("product.price")}</Label>
            <Input
              id="price"
              type="number"
              min={0}
              step="0.01"
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cost">{t("product.cost")}</Label>
            <Input
              id="cost"
              type="number"
              min={0}
              step="0.01"
              value={form.cost}
              onChange={(event) => setForm({ ...form, cost: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minStock">{t("product.minStock")}</Label>
            <Input
              id="minStock"
              type="number"
              min={0}
              value={form.minStock}
              onChange={(event) => setForm({ ...form, minStock: event.target.value })}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="isActive" className="text-sm">
              {t("common.active")}
            </Label>
            <Switch
              id="isActive"
              checked={form.isActive}
              onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">{t("product.description")}</Label>
            <Textarea
              id="description"
              rows={2}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
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
