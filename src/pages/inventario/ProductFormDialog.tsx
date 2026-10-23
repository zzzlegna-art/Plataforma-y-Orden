import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import { useApp } from "@/hooks/use-app";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import { supabase } from "@/integrations/supabase/client";
import { createProduct, generarSkuProducto, updateProduct } from "@/lib/actions/catalogs";
import {
  clearProductFormDraft,
  EMPTY_PRODUCT_FORM,
  getProductFormDraftKey,
  readProductFormDraft,
  writeProductFormDraft,
  type ProductFormDraft,
} from "@/lib/product-form-draft";
import { normalizeCatalogText } from "@/lib/catalog-text";
import { getProductTechnicalSpecFieldsForCategory, getProductTechnicalSpecsForCategory } from "@/lib/product-specs";
import { etiquetaTipoProducto, tiposProductoOrdenados } from "@/lib/products";
import type { Product, ProductCategory, ProductTechnicalSpecs } from "@/lib/types";

const PRODUCT_IMAGE_BUCKET = "product-images";
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const getProductImageStoragePath = (url?: string): string | undefined => {
  if (!url) return undefined;
  const marker = `/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`;
  const start = url.indexOf(marker);
  if (start < 0) return undefined;
  try {
    return decodeURIComponent(url.slice(start + marker.length).split("?")[0]);
  } catch {
    return undefined;
  }
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
  const { user } = useApp();
  const runAction = useRunAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_PRODUCT_FORM);
  const [technicalSpecs, setTechnicalSpecs] = useState<ProductTechnicalSpecs>({});
  const [saving, setSaving] = useState(false);
  const [skuManual, setSkuManual] = useState(Boolean(product));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(product?.imageUrl ?? null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const productRef = useRef(product);
  const skipDraftSaveRef = useRef(false);
  const draftKey = getProductFormDraftKey(product?.id, user?.id);
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    productRef.current = product;
  }, [product]);

  useEffect(() => {
    if (!open) return;
    skipDraftSaveRef.current = true;
    const currentProduct = productRef.current;
    setImageFile(null);
    setImagePreview(currentProduct?.imageUrl ?? null);
    setRemoveImage(false);
    setImageError("");
    if (imageInputRef.current) imageInputRef.current.value = "";

    const draft = readProductFormDraft(draftKey);
    if (draft) {
      setForm(draft.form);
      setTechnicalSpecs(draft.technicalSpecs);
      setSkuManual(draft.skuManual);
      setRemoveImage(draft.removeImage);
      setImagePreview(draft.removeImage ? null : currentProduct?.imageUrl ?? null);
      setDraftRestored(true);
      return;
    }

    setSkuManual(Boolean(currentProduct));
    setTechnicalSpecs(currentProduct?.technicalSpecs ?? {});
    setForm(
      currentProduct
        ? {
            sku: currentProduct.sku,
            name: currentProduct.name,
            description: currentProduct.description ?? "",
            categoryId: currentProduct.categoryId ?? "",
            brandId: currentProduct.brandId ?? "",
            categoria: currentProduct.categoria ?? "",
            price: String(currentProduct.price),
            cost: String(currentProduct.cost),
            minStock: String(currentProduct.minStock),
            isActive: currentProduct.isActive,
          }
        : EMPTY_PRODUCT_FORM,
    );
    setDraftRestored(false);
  }, [open, draftKey]);

  useEffect(() => {
    if (!open) return;
    if (skipDraftSaveRef.current) {
      skipDraftSaveRef.current = false;
      return;
    }
    const draft: ProductFormDraft = {
      version: 1,
      form,
      technicalSpecs,
      skuManual,
      removeImage,
    };
    writeProductFormDraft(draftKey, draft);
  }, [open, draftKey, form, technicalSpecs, skuManual, removeImage]);

  useEffect(() => {
    if (!imageFile) return;
    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!(PRODUCT_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setImageError(t("product.imageInvalidType"));
      event.target.value = "";
      return;
    }
    if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      setImageError(t("product.imageTooLarge"));
      event.target.value = "";
      return;
    }
    setImageError("");
    setRemoveImage(false);
    setImageFile(file);
  };

  const clearImageSelection = () => {
    if (imageFile) {
      setImageFile(null);
      setImagePreview(product?.imageUrl ?? null);
      setRemoveImage(false);
    } else if (product?.imageUrl && !removeImage) {
      setRemoveImage(true);
      setImagePreview(null);
    } else if (removeImage) {
      setRemoveImage(false);
      setImagePreview(product?.imageUrl ?? null);
    }
    if (imageInputRef.current) imageInputRef.current.value = "";
    setImageError("");
  };

  const selectedProductType = db.productTypes.find((type) => type.key === form.categoria);
  const technicalEnabled = Boolean(
    form.categoria &&
      form.categoria !== "repuesto" &&
      selectedProductType?.mayoristaGroup !== "repuestos",
  );
  const technicalFields = technicalEnabled
    ? getProductTechnicalSpecFieldsForCategory(form.categoria)
    : [];

  const save = async () => {
    setSaving(true);
    let uploadedPath: string | undefined;
    try {
      let imageUrl: string | null | undefined = product?.imageUrl;
      if (imageFile) {
        const extension =
          imageFile.type === "image/png" ? "png" : imageFile.type === "image/webp" ? "webp" : "jpg";
        uploadedPath = `products/${crypto.randomUUID()}.${extension}`;
        const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(uploadedPath, imageFile, {
          cacheControl: "3600",
          contentType: imageFile.type,
          upsert: false,
        });
        if (error) {
          await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([uploadedPath]);
          uploadedPath = undefined;
          toast.error(t("product.imageUploadFailed"));
          return;
        }
        imageUrl = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(uploadedPath).data.publicUrl;
      } else if (removeImage) {
        imageUrl = null;
      }

      const payload = {
        sku: form.sku,
        name: form.name,
        description: form.description,
        imageUrl,
        technicalSpecs: getProductTechnicalSpecsForCategory(form.categoria, technicalSpecs, technicalEnabled) ?? {},
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
      if (!result) {
        if (uploadedPath) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([uploadedPath]);
        return;
      }

      const previousPath = getProductImageStoragePath(product?.imageUrl);
      if (previousPath && previousPath !== uploadedPath && (uploadedPath || removeImage)) {
        // La nueva referencia ya quedó guardada; si falla la limpieza, la foto vieja
        // puede quedar huérfana, pero no se afecta el producto ni su inventario.
        try {
          await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([previousPath]);
        } catch {
          // No bloquear un guardado correcto por una limpieza de almacenamiento.
        }
      }
      clearProductFormDraft(draftKey);
      setDraftRestored(false);
      setOpen(false);
      onSaved?.(result);
    } catch {
      if (uploadedPath) {
        try {
          await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([uploadedPath]);
        } catch {
          // La limpieza es secundaria al error original.
        }
      }
      toast.error(t("product.imageUploadFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto pr-0 sm:max-w-2xl">
        <DialogHeader className="pr-6">
          <DialogTitle>{product ? t("product.editTitle") : t("product.createTitle")}</DialogTitle>
          <DialogDescription>{t("product.formDescription")}</DialogDescription>
          {draftRestored ? (
            <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {t("product.draftRestored")}
            </p>
          ) : null}
        </DialogHeader>

        <div className="grid gap-4 py-2 pr-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sku">{t("product.sku")}</Label>
            <Input
              id="sku"
              value={form.sku}
              placeholder={t("product.skuPlaceholder")}
              onChange={(event) => {
                setSkuManual(true);
                setForm({ ...form, sku: event.target.value.toUpperCase() });
              }}
            />
            <p className="text-xs text-muted-foreground">{t("product.skuHint")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">{t("product.name")}</Label>
            <Input
              id="name"
              value={form.name}
              placeholder="iPhone 13 128 GB"
              onChange={(event) => {
                const name = event.target.value;
                setForm((current) => ({
                  ...current,
                  name,
                  ...(!product && !skuManual ? { sku: generarSkuProducto(db, name) } : {}),
                }));
              }}
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
          <div className="space-y-2 rounded-xl border border-border/70 p-3 sm:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt={t("product.imagePreviewAlt")}
                  className="h-24 w-24 shrink-0 rounded-xl border object-cover"
                />
              ) : (
                <div className="grid h-24 w-24 shrink-0 place-items-center rounded-xl border border-dashed bg-muted/40 text-muted-foreground">
                  <ImagePlus className="h-8 w-8" strokeWidth={1.6} />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <Label htmlFor="productImage">{t("product.image")}</Label>
                  <p className="mt-1 text-xs text-muted-foreground">{t("product.imageHint")}</p>
                </div>
                <Input
                  ref={imageInputRef}
                  id="productImage"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageChange}
                  className="cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-semibold"
                />
                {imageError ? (
                  <p role="alert" className="text-xs font-medium text-destructive">{imageError}</p>
                ) : null}
              </div>
              {(imagePreview || imageFile || (product?.imageUrl && removeImage)) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={clearImageSelection}
                  className="shrink-0"
                >
                  {imageFile
                    ? t("product.imageCancelChange")
                    : removeImage
                      ? t("product.imageRestore")
                      : t("product.imageRemove")}
                </Button>
              ) : null}
            </div>
          </div>

          {technicalEnabled ? (
            <div className="space-y-4 rounded-xl border border-border/70 bg-card p-3 sm:col-span-2">
              <div>
                <p className="text-sm font-semibold">{t("product.technicalDetails")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("product.technicalSpecsHint")}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {technicalFields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`technical-${field.key}`}>{t(field.labelKey)}</Label>
                    <Input
                      id={`technical-${field.key}`}
                      value={normalizeCatalogText(technicalSpecs[field.key] ?? "")}
                      placeholder={field.placeholder}
                      maxLength={120}
                      onChange={(event) =>
                        setTechnicalSpecs((current) => ({ ...current, [field.key]: event.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>

              {["celular", "tablet"].includes(form.categoria) &&
              technicalSpecs.cameras?.trim() &&
              !(technicalSpecs.rearCamera?.trim() && technicalSpecs.frontCamera?.trim()) ? (
                <p role="status" className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {t("product.legacyCameraSpec", { value: technicalSpecs.cameras })}
                </p>
              ) : null}

              {!["celular", "tablet", "reloj", "audifono"].includes(form.categoria) ? (
              <div className="space-y-3 border-t border-border/70 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{t("product.customSpecsTitle")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("product.customSpecsHint")}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setTechnicalSpecs((current) => ({
                        ...current,
                        customFields: [
                          ...(current.customFields ?? []),
                          { id: crypto.randomUUID(), name: "", value: "" },
                        ],
                      }))
                    }
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    {t("product.addCustomSpec")}
                  </Button>
                </div>
                {(technicalSpecs.customFields ?? []).map((customField) => (
                  <div key={customField.id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                    <div className="space-y-1.5">
                      <Label htmlFor={`custom-spec-name-${customField.id}`}>{t("product.customSpecName")}</Label>
                      <Input
                        id={`custom-spec-name-${customField.id}`}
                        value={normalizeCatalogText(customField.name)}
                        maxLength={80}
                        placeholder={t("product.customSpecNamePlaceholder")}
                        onChange={(event) =>
                          setTechnicalSpecs((current) => ({
                            ...current,
                            customFields: (current.customFields ?? []).map((item) =>
                              item.id === customField.id ? { ...item, name: event.target.value } : item,
                            ),
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`custom-spec-value-${customField.id}`}>{t("product.customSpecValue")}</Label>
                      <Input
                        id={`custom-spec-value-${customField.id}`}
                        value={normalizeCatalogText(customField.value)}
                        maxLength={120}
                        placeholder={t("product.customSpecValuePlaceholder")}
                        onChange={(event) =>
                          setTechnicalSpecs((current) => ({
                            ...current,
                            customFields: (current.customFields ?? []).map((item) =>
                              item.id === customField.id ? { ...item, value: event.target.value } : item,
                            ),
                          }))
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={t("product.removeCustomSpec")}
                      onClick={() =>
                        setTechnicalSpecs((current) => ({
                          ...current,
                          customFields: (current.customFields ?? []).filter((item) => item.id !== customField.id),
                        }))
                      }
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      {t("product.removeCustomSpec")}
                    </Button>
                  </div>
                ))}
              </div>
              ) : null}
            </div>
          ) : null}

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

        <DialogFooter className="pr-6">
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
