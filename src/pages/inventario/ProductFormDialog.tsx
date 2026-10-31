import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, ChevronDown, ImagePlus, Palette, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FormattedNumberInput } from "@/components/shared/formatted-number-input";
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
import { ProductSpecificationField, PRODUCT_TECHNICAL_TEXT_LIMIT, PRODUCT_CUSTOM_SPEC_NAME_LIMIT } from "./ProductSpecificationField";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/hooks/use-app";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import { supabase } from "@/integrations/supabase/client";
import { createProduct, generarSkuAlEditar, generarSkuProducto, updateProduct } from "@/lib/actions/catalogs";
import {
  clearProductFormDraft,
  EMPTY_PRODUCT_FORM,
  getProductFormDraftKey,
  readProductFormDraft,
  writeProductFormDraft,
  type ProductFormDraft,
} from "@/lib/product-form-draft";
import { getProductImageExtension, validateProductImageFile } from "@/lib/product-image";
import { preciosPorColorSinConfigurar, verificarPreciosPorColor } from "@/lib/product-color-pricing";
import { swatchForVariant, verifyVariantPhotoUrls } from "@/lib/product-color-photos";
import { getProductTechnicalSpecFieldsForCategory, getProductTechnicalSpecsForCategory } from "@/lib/product-specs";
import { etiquetaTipoProducto, tiposProductoOrdenados } from "@/lib/products";
import type { Product, ProductCategory, ProductTechnicalSpecs, ProductColorVariant } from "@/lib/types";
import "./product-editor-premium.css";

/** Breves en una línea; campos descriptivos expandibles para fichas largas. */
const SHORT_TECHNICAL_FIELDS = new Set([
  "storage", "ram", "color", "weight", "refreshRate", "screenResolution", "power", "caseSize",
]);

const PRODUCT_IMAGE_BUCKET = "product-images";

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

/** Vista temporal de la fotografía elegida sin transformar la original. */
const VariantPhotoPreview = ({ file, url, color }: { file?: File; url?: string; color: string }) => {
  const [preview, setPreview] = useState<string>();
  useEffect(() => {
    if (!file) { setPreview(undefined); return; }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return preview || url ? (
    <img className="nx-editor-variant-photo-preview" src={preview || url}
      alt={`Foto del color ${color || "sin nombre"}`} />
  ) : (
    <span className="nx-editor-variant-photo-placeholder" aria-hidden="true">
      <ImagePlus className="h-5 w-5" />
    </span>
  );
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
  const [colorVariants, setColorVariants] = useState<ProductColorVariant[]>(product?.colorVariants ?? []);
  // Los archivos se mantienen localmente hasta pulsar Guardar, nunca en borradores JSON.
  const [variantImageFiles, setVariantImageFiles] = useState<Record<number, File>>({});
  const [saving, setSaving] = useState(false);
  const [skuManual, setSkuManual] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(product?.imageUrl ?? null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const productRef = useRef(product);
  const dbRef = useRef(db);
  const skipDraftSaveRef = useRef(false);
  const draftKey = getProductFormDraftKey(product?.id, user?.id);
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    productRef.current = product;
  }, [product]);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  useEffect(() => {
    if (!open) return;
    skipDraftSaveRef.current = true;
    const currentProduct = productRef.current;
    setColorVariants(currentProduct?.colorVariants ?? []);
    setVariantImageFiles({});
    setImageFile(null);
    setImagePreview(currentProduct?.imageUrl ?? null);
    setRemoveImage(false);
    setImageError("");
    if (imageInputRef.current) imageInputRef.current.value = "";

    const draft = readProductFormDraft(draftKey);
    if (draft && (!currentProduct ||
      (draft.sourceUpdatedAt !== undefined && draft.sourceUpdatedAt === currentProduct.updatedAt))) {
      // No recuperar precios viejos de un borrador si el producto ya fue modificado.
      // Borradores antiguos marcaban toda edición como manual aunque nadie hubiera escrito la SKU.
      // Solo conservar ese bloqueo cuando la SKU realmente difiere de la original.
      const skuWasManuallyEdited = draft.skuManual &&
        (!currentProduct || draft.form.sku.trim().toUpperCase() !== currentProduct.sku.trim().toUpperCase());
      setForm({
        ...draft.form,
        ...(!skuWasManuallyEdited ? {
          sku: generarSkuAlEditar(dbRef.current, draft.form.name, draft.form.categoria, currentProduct, draft.form.brandId),
        } : {}),
      });
      setTechnicalSpecs(draft.technicalSpecs);
      if (draft.colorVariants) setColorVariants(draft.colorVariants);
      setSkuManual(skuWasManuallyEdited);
      setRemoveImage(draft.removeImage);
      setImagePreview(draft.removeImage ? null : currentProduct?.imageUrl ?? null);
      setDraftRestored(true);
      return;
    }

    if (draft && currentProduct) clearProductFormDraft(draftKey);
    // Editar una referencia también inicia en modo automático, sin modificarla hasta cambiar nombre o tipo.
    setSkuManual(false);
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
      colorVariants,
      sourceUpdatedAt: productRef.current?.updatedAt,
      skuManual,
      removeImage,
    };
    writeProductFormDraft(draftKey, draft);
  }, [open, draftKey, form, technicalSpecs, colorVariants, skuManual, removeImage]);

  useEffect(() => {
    if (!imageFile) return;
    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const validationError = validateProductImageFile(file);
    if (validationError === "invalid_type") {
      setImageError(t("product.imageInvalidType"));
      event.target.value = "";
      return;
    }
    if (validationError === "too_large") {
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

  const handleVariantImageChange = (index: number, file?: File) => {
    if (!file) return;
    const error = validateProductImageFile(file);
    if (error) {
      toast.error(error === "too_large" ? t("product.imageTooLarge") : t("product.imageInvalidType"));
      return;
    }
    setVariantImageFiles((old) => ({ ...old, [index]: file }));
  };
  const clearVariantImage = (index: number) => {
    setVariantImageFiles((old) => {
      const next = { ...old };
      delete next[index];
      return next;
    });
    setColorVariants((old) => old.map((v, i) => i === index ? { ...v, imageUrl: undefined } : v));
  };
  const removeColorVariant = (index: number) => {
    setVariantImageFiles((old) => {
      const next: Record<number, File> = {};
      Object.entries(old).forEach(([key, file]) => {
        const i = Number(key);
        if (i < index) next[i] = file;
        if (i > index) next[i - 1] = file;
      });
      return next;
    });
    setColorVariants((old) => old.filter((_, i) => i !== index));
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
    // Los importes de color deben ser válidos ANTES de subir imágenes o tocar el inventario.
    if (colorVariants.some((v) => !Number.isFinite(v.price) || v.price < 0 ||
      !Number.isFinite(v.cost) || v.cost < 0)) {
      toast.error("Revisa el costo y precio de los colores: no se permiten valores inválidos.");
      return;
    }
    setSaving(true);
    let uploadedPath: string | undefined;
    const uploadedVariantPaths: string[] = [];
    let persisted = false;
    const cleanupUploads = async () => {
      const paths = [...uploadedVariantPaths, ...(uploadedPath ? [uploadedPath] : [])];
      if (paths.length) await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove(paths);
    };
    try {
      let imageUrl: string | null | undefined = product?.imageUrl;
      if (imageFile) {
        const extension = getProductImageExtension(imageFile.type);
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

      // Foto independiente y opcional por color dentro de la misma referencia.
      const variantsWithPhotos = colorVariants.map((variant) => ({ ...variant }));
      if (form.categoria !== "repuesto") {
        for (const [rawIndex, file] of Object.entries(variantImageFiles)) {
          const index = Number(rawIndex);
          if (!variantsWithPhotos[index]) continue;
          const path = `products/colors/${crypto.randomUUID()}.${getProductImageExtension(file.type)}`;
          const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, {
            cacheControl: "3600", contentType: file.type, upsert: false,
          });
          if (error) {
            toast.error(`No se pudo subir la foto del color ${variantsWithPhotos[index].color || "seleccionado"}.`);
            await cleanupUploads();
            return;
          }
          uploadedVariantPaths.push(path);
          variantsWithPhotos[index].imageUrl = supabase.storage.from(PRODUCT_IMAGE_BUCKET)
            .getPublicUrl(path).data.publicUrl;
        }
      }
      const payload = {
        sku: form.sku,
        name: form.name,
        description: form.description,
        imageUrl,
        technicalSpecs: getProductTechnicalSpecsForCategory(form.categoria, technicalSpecs, technicalEnabled) ?? {},
        colorVariants: form.categoria === "repuesto" ? [] : variantsWithPhotos,
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
        { key: `guardar-producto:${product?.id ?? "nuevo"}` },
      );
      if (!result) {
        await cleanupUploads();
        return;
      }
      persisted = true;
      // No cerrar ni borrar el borrador antes de comprobar lo que realmente guardó Supabase.
      // Este control detecta tarifas cero que no coincidían con el formulario.
      const { data: guardado, error: comprobacionError } = await supabase
        .from("bodega_products")
        .select("color_variants")
        .eq("id", result.id)
        .single();
      if (comprobacionError || !verificarPreciosPorColor(
        payload.colorVariants,
        guardado?.color_variants,
      ) || !verifyVariantPhotoUrls(payload.colorVariants, guardado?.color_variants)) {
        toast.error(
          "No se pudieron verificar los precios por color en el servidor. " +
          "La ventana permanecerá abierta para que revises los valores.",
        );
        return;
      }
      // Solo limpiar URLs anteriores que ya no estén enlazadas a ninguna foto.
      const oldUrls = [
        product?.imageUrl,
        ...(product?.colorVariants ?? []).map((v) => v.imageUrl),
      ].filter((url): url is string => Boolean(url));
      const stillInUse = new Set([
        imageUrl,
        ...payload.colorVariants.map((v) => v.imageUrl),
      ].filter((url): url is string => Boolean(url)));
      const oldPaths = oldUrls.filter((url) => !stillInUse.has(url))
        .map(getProductImageStoragePath)
        .filter((path): path is string => Boolean(path));
      if (oldPaths.length) {
        try { await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([...new Set(oldPaths)]); }
        catch { /* La limpieza es secundaria al guardado exitoso. */ }
      }
      clearProductFormDraft(draftKey);
      setVariantImageFiles({});
      setDraftRestored(false);
      setOpen(false);
      toast.success(t(product ? "product.updated" : "product.created"));
      onSaved?.(result);
    } catch {
      if (!persisted) {
        try { await cleanupUploads(); } catch { /* Mantener error de escritura original. */ }
      }
      toast.error("No se pudo completar el guardado del producto y sus imágenes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="nx-product-editor !max-w-none">
        <DialogHeader className="nx-editor-header">
          <DialogTitle>{product ? t("product.editTitle") : t("product.createTitle")}</DialogTitle>
          <DialogDescription>{t("product.formDescription")}</DialogDescription>
          {draftRestored ? (
            <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {t("product.draftRestored")}
            </p>
          ) : null}
        </DialogHeader>

        <div className="nx-editor-scroll" tabIndex={-1}>
          <div className="nx-editor-primary-grid">
          <section className="nx-editor-panel nx-editor-basics" aria-labelledby="nx-editor-basics-title">
            <div className="nx-editor-section-heading">
              <div>
                <h3 id="nx-editor-basics-title">Información del producto</h3>
                <p>Identificación, categoría y precios generales de la referencia.</p>
              </div>
            </div>
            <div className="nx-editor-fields">
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
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="text-xs text-muted-foreground">{t("product.skuHint")}</p>
              <button
                type="button"
                className="text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() => {
                  setSkuManual(false);
                  setForm((current) => ({
                    ...current,
                    sku: generarSkuProducto(db, current.name, product?.id, undefined, current.categoria, db.brands.find((brand) => brand.id === current.brandId)?.name),
                  }));
                }}
              >
                {t("product.regenerateSku")}
              </button>
            </div>
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
                  ...(!skuManual ? { sku: generarSkuAlEditar(db, name, current.categoria, product, current.brandId) } : {}),
                }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("product.type")}</Label>
            <OptionSelect
              value={form.categoria}
              onChange={(value) => setForm((current) => ({
                ...current,
                categoria: value,
                // El código se actualiza también en edición, salvo que el usuario lo haya escrito manualmente.
                ...(!skuManual ? {
                  sku: generarSkuAlEditar(db, current.name, value, product, current.brandId),
                } : {}),
              }))}
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
              onChange={(value) => setForm((current) => ({
                ...current,
                brandId: value,
                ...(!skuManual ? {
                  sku: generarSkuAlEditar(db, current.name, current.categoria, product, value),
                } : {}),
              }))}
              emptyLabel={t("common.none")}
              options={db.brands.map((brand) => ({ value: brand.id, label: brand.name }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">{t("product.price")}</Label>
            <FormattedNumberInput
              id="price"
              value={form.price}
              onValueChange={(price) => setForm((current) => ({ ...current, price }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cost">{t("product.cost")}</Label>
            <FormattedNumberInput
              id="cost"
              value={form.cost}
              onValueChange={(cost) => setForm((current) => ({ ...current, cost }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minStock">{t("product.minStock")}</Label>
            <FormattedNumberInput
              id="minStock"
              value={form.minStock}
              allowDecimal={false}
              onValueChange={(minStock) => setForm((current) => ({ ...current, minStock }))}
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
            </div>
          </section>
          <div className="nx-editor-aside">
          {form.categoria && form.categoria !== "repuesto" ? (
            <section className="nx-editor-panel nx-editor-variants" aria-label="Precios por color">
              <div className="nx-editor-variants-heading">
                <div className="nx-editor-variants-heading-copy">
                  <div className="nx-editor-accent-icon" aria-hidden="true"><Palette className="h-5 w-5" /></div>
                  <div>
                  <p className="text-sm font-bold text-foreground">Colores y precios por variante</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Una sola referencia y SKU. Define costo y precio de venta por color;
                    el color se asignará después, al serializar el pedido.
                    Puedes adjuntar una fotografía opcional por color para el visor de inventario.
                  </p>
                  </div>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() =>
                  setColorVariants((previous) => [...previous, { color: "", cost: Number(form.cost) || 0, price: Number(form.price) || 0 }])
                }>
                  <Plus className="h-4 w-4" /> Agregar color
                </Button>
              </div>
              {colorVariants.length > 0 ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-foreground">
                  <strong>Precios de venta de cada color:</strong> escribe el importe en la columna
                  <strong> Venta sugerida</strong>. El campo «Precio» de la izquierda es el precio
                  general y no sustituye los precios individuales.
                </div>
              ) : null}
              {preciosPorColorSinConfigurar(colorVariants).length > 0 ? (
                <div role="status" className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-foreground">
                  <strong>Sin precio de venta:</strong> {preciosPorColorSinConfigurar(colorVariants).join(", ")}.
                  Estos colores mostrarán $0 en pedidos hasta que registres su precio de venta.
                </div>
              ) : null}
              {colorVariants.length === 0 ? (
                <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                  Opcional: si todos los colores cuestan lo mismo, deja la lista vacía y continúa usando el precio general.
                </p>
              ) : (
                <div className="nx-editor-variant-table">
                  <div className="nx-editor-variant-columns" aria-hidden="true">
                    <span>Color</span><span>Costo de compra</span><span>Venta sugerida</span><span />
                  </div>
                  {colorVariants.map((variant, index) => (
                    <div key={index} className="nx-editor-variant-row">
                      <div className="nx-editor-variant-field">
                        <Label htmlFor={`variant-name-${index}`}>Color</Label>
                        <Input id={`variant-name-${index}`} placeholder="Blanco, Azul, Borgoña…" value={variant.color}
                          onChange={(e) => setColorVariants((old) => old.map((v,i) => i===index ? {...v,color:e.target.value} : v))} />
                      </div>
                      <div className="nx-editor-variant-field">
                        <Label htmlFor={`variant-cost-${index}`}>Costo</Label>
                        <FormattedNumberInput id={`variant-cost-${index}`} value={String(variant.cost)}
                          onValueChange={(value) => setColorVariants((old) => old.map((v,i) => i===index ? {...v,cost:Number(value)||0} : v))} />
                      </div>
                      <div className="nx-editor-variant-field">
                        <Label htmlFor={`variant-price-${index}`}>Venta sugerida</Label>
                        <FormattedNumberInput id={`variant-price-${index}`} value={String(variant.price)}
                          onValueChange={(value) => setColorVariants((old) => old.map((v,i) => i===index ? {...v,price:Number(value)||0} : v))} />
                      </div>
                      <Button type="button" variant="outline" size="icon" className="nx-editor-delete-color" aria-label={`Eliminar color ${variant.color || index + 1}`}
                        onClick={() => removeColorVariant(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <div className="nx-editor-variant-media">
                        <div className="nx-editor-variant-color-chip">
                          <label htmlFor={`variant-swatch-${index}`}>Muestra</label>
                          <input id={`variant-swatch-${index}`} type="color"
                            value={swatchForVariant(variant)}
                            aria-label={`Color visual de ${variant.color || "la variante"}`}
                            onChange={(event) => setColorVariants((old) => old.map((entry, i) =>
                              i === index ? { ...entry, swatchHex: event.target.value } : entry))}
                          />
                        </div>
                        <div className="nx-editor-variant-photo-field">
                          <VariantPhotoPreview file={variantImageFiles[index]} url={variant.imageUrl} color={variant.color} />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold">Fotografía de {variant.color || "este color"}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Opcional · JPG, PNG o WebP · máximo 5 MB
                            </p>
                          </div>
                          <label className="nx-editor-variant-photo-upload">
                            <Camera className="h-4 w-4" />
                            {variantImageFiles[index] || variant.imageUrl ? "Cambiar foto" : "Subir foto"}
                            <input type="file" accept="image/jpeg,image/png,image/webp"
                              aria-label={`Subir foto del color ${variant.color || index + 1}`}
                              onChange={(event) => {
                                handleVariantImageChange(index, event.currentTarget.files?.[0]);
                                event.currentTarget.value = "";
                              }}
                            />
                          </label>
                          {variantImageFiles[index] || variant.imageUrl ? (
                            <Button type="button" size="icon" variant="ghost"
                              aria-label={`Quitar foto del color ${variant.color || index + 1}`}
                              onClick={() => clearVariantImage(index)}>
                              <X className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}
          <section className="nx-editor-panel nx-editor-image" aria-labelledby="nx-editor-image-title">
            <div className="nx-editor-section-heading nx-editor-image-heading">
              <div>
                <h3 id="nx-editor-image-title">Imagen del producto</h3>
                <p>Agrega, reemplaza o elimina la fotografía de esta referencia.</p>
              </div>
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
          </section>
          </div>
          </div>
          <details className="nx-editor-advanced">
            <summary className="nx-editor-advanced-summary">
              <span className="nx-editor-advanced-summary-icon"><SlidersHorizontal className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <strong>Características técnicas y descripción</strong>
                <small>Opciones avanzadas para completar la ficha sin ocupar espacio adicional.</small>
              </span>
              <ChevronDown className="nx-editor-advanced-chevron h-4 w-4" aria-hidden="true" />
            </summary>
            <div className="nx-editor-advanced-content">


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
                    <ProductSpecificationField
                      id={`technical-${field.key}`}
                      value={technicalSpecs[field.key] ?? ""}
                      placeholder={field.placeholder}
                      multiline={!SHORT_TECHNICAL_FIELDS.has(field.key)}
                      onValueChange={(value) =>
                        setTechnicalSpecs((current) => ({ ...current, [field.key]: value }))
                      }
                    />
                    {(technicalSpecs[field.key]?.length ?? 0) >= 800 ? (
                      <p className="text-right text-xs text-muted-foreground">
                        {technicalSpecs[field.key]?.length ?? 0} / {PRODUCT_TECHNICAL_TEXT_LIMIT}
                      </p>
                    ) : null}
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
                        value={customField.name}
                        maxLength={PRODUCT_CUSTOM_SPEC_NAME_LIMIT}
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
                      <ProductSpecificationField
                        id={`custom-spec-value-${customField.id}`}
                        value={customField.value}
                        multiline
                        placeholder={t("product.customSpecValuePlaceholder")}
                        onValueChange={(value) =>
                          setTechnicalSpecs((current) => ({
                            ...current,
                            customFields: (current.customFields ?? []).map((item) =>
                              item.id === customField.id ? { ...item, value } : item,
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
          </details>
        </div>

        <DialogFooter className="nx-editor-footer">
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
