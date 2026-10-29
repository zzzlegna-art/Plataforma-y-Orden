import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { FileUp, FileSpreadsheet, RotateCcw } from "lucide-react";
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
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import { createProduct, generarSkuProducto, type ProductInput } from "@/lib/actions/catalogs";
import { descargarCsv } from "@/lib/csv";
import {
  MAX_PRODUCT_CSV_IMPORT_BYTES,
  parseProductCsv,
  parseProductWorkbook,
  ProductCsvImportError,
  type ProductCsvRow,
} from "@/lib/product-csv-import";
import { getProductTechnicalSpecFieldsForCategory } from "@/lib/product-specs";
import { getProductCsvFeatureCategoryIssue } from "@/lib/product-csv-features";
import { etiquetaTipoProducto } from "@/lib/products";
import type { ProductTechnicalSpecs, ProductType } from "@/lib/types";

type PreparedRow = {
  row: ProductCsvRow;
  status: "ready" | "duplicate" | "invalid";
  reason?: string;
  input?: ProductInput;
};

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const sameName = (left: string, right: string) => normalize(left) === normalize(right);

const parseFeatures = (
  text: string,
  category: string | undefined,
  t: (key: string) => string,
): ProductTechnicalSpecs | undefined => {
  if (!text.trim() || !category) return undefined;
  const fields = getProductTechnicalSpecFieldsForCategory(category);
  const specs: ProductTechnicalSpecs = {};
  const customFields: NonNullable<ProductTechnicalSpecs["customFields"]> = [];

  text.split(/\s*\|\s*/).forEach((entry, index) => {
    const separator = entry.indexOf(":");
    if (separator < 1) return;
    const label = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (!label || !value) return;
    const field = fields.find((candidate) =>
      sameName(t(candidate.labelKey), label) || sameName(candidate.key, label),
    );
    if (field) specs[field.key] = value;
    else customFields.push({ id: `csv-${Date.now()}-${index}`, name: label, value });
  });

  if (customFields.length) specs.customFields = customFields;
  return Object.keys(specs).length ? specs : undefined;
};

const matchType = (
  value: string,
  types: ProductType[],
  t: (key: string) => string,
) => types.find((type) =>
  [type.key, type.name, etiquetaTipoProducto(t, type)].some((candidate) => sameName(candidate, value)),
);

export const ProductImportDialog = ({ trigger }: { trigger: React.ReactNode }) => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ProductCsvRow[]>([]);
  const [fileError, setFileError] = useState("");

  const preparedRows = useMemo<PreparedRow[]>(() => {
    const normalizeSku = (value: string) => value.trim().toUpperCase();
    const existingSkus = new Set(db.products.map((product) => normalizeSku(product.sku)));
    const seenSkus = new Set<string>();

    return rows.map((row) => {
      if (row.error) return { row, status: "invalid", reason: row.error };

      let categoria: string | undefined;
      let categoryId: string | undefined;
      let brandId: string | undefined;

      if (row.category) {
        const parts = row.category.split(/\s+\/\s+/).map((part) => part.trim()).filter(Boolean);
        const first = parts[0] ?? "";
        const foundType = matchType(first, db.productTypes, t);
        const foundCategory = parts.length > 1
          ? db.categories.find((category) => sameName(category.name, parts.slice(1).join(" / ")))
          : undefined;

        if (foundType) {
          categoria = foundType.key;
          if (parts.length > 1 && !foundCategory) {
            return { row, status: "invalid", reason: t("productImport.unknownCategory", { category: parts.slice(1).join(" / ") }) };
          }
          categoryId = foundCategory?.id;
        } else if (parts.length === 1) {
          const categoryOnly = db.categories.find((category) => sameName(category.name, first));
          if (categoryOnly) categoryId = categoryOnly.id;
          else return { row, status: "invalid", reason: t("productImport.unknownType", { category: first }) };
        } else {
          return { row, status: "invalid", reason: t("productImport.unknownType", { category: first }) };
        }
      }

      const featureCategoryIssue = getProductCsvFeatureCategoryIssue(
        row.features,
        categoria,
        getProductTechnicalSpecFieldsForCategory(categoria).length > 0,
      );
      if (featureCategoryIssue === "missing_type") {
        return { row, status: "invalid", reason: t("productImport.featuresRequireType") };
      }
      if (featureCategoryIssue === "unsupported_type") {
        return { row, status: "invalid", reason: t("productImport.featuresUnsupportedType") };
      }

      if (featureCategoryIssue === "malformed_features") {
        return { row, status: "invalid", reason: t("productImport.featuresMalformed") };
      }

      if (row.brand) {
        const brand = db.brands.find((candidate) => sameName(candidate.name, row.brand));
        if (!brand) return { row, status: "invalid", reason: t("productImport.unknownBrand", { brand: row.brand }) };
        brandId = brand.id;
      }

      const sku = row.sku
        ? normalizeSku(row.sku)
        : generarSkuProducto(db, row.name, undefined, seenSkus, categoria, db.brands.find((brand) => brand.id === brandId)?.name);
      if (existingSkus.has(sku) || seenSkus.has(sku)) {
        return { row, status: "duplicate", reason: t("productImport.duplicateSku", { sku }) };
      }
      seenSkus.add(sku);

      const input: ProductInput = {
        sku,
        name: row.name,
        description: row.description || undefined,
        imageUrl: row.imageUrl || undefined,
        technicalSpecs: parseFeatures(row.features, categoria, t),
        categoryId,
        brandId,
        categoria,
        price: row.price,
        cost: row.cost,
        minStock: row.minStock,
        isActive: true,
      };
      return { row, status: "ready", input };
    });
  }, [db, rows, t]);

  const readyRows = preparedRows.filter((item) => item.status === "ready" && item.input);
  const duplicateCount = preparedRows.filter((item) => item.status === "duplicate").length;
  const invalidCount = preparedRows.filter((item) => item.status === "invalid").length;

  const reset = () => {
    setFileName("");
    setRows([]);
    setFileError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) reset();
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    // Permite volver a seleccionar el mismo archivo después de corregirlo o de un error.
    input.value = "";
    setFileError("");
    setFileName("");
    setRows([]);
    if (file.size > MAX_PRODUCT_CSV_IMPORT_BYTES) {
      setFileError(t("productImport.fileTooLarge"));
      return;
    }

    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    const isCsv = extension === "csv" || file.type === "text/csv";
    const isWorkbook = ["xlsx", "xls", "xlsm", "xlsb"].includes(extension);
    if (!isCsv && !isWorkbook) {
      setFileError(t("productImport.csvOnly"));
      return;
    }

    try {
      const parsed = isCsv
        ? parseProductCsv(await file.text())
        : parseProductWorkbook(await file.arrayBuffer());
      setRows(parsed);
      setFileName(file.name);
    } catch (error) {
      const message = error instanceof ProductCsvImportError
        ? error.message
        : t("productImport.readFailed");
      setFileError(message);
    }
  };

  const importProducts = async () => {
    if (!readyRows.length) return;
    const products = readyRows.flatMap((item) => item.input ? [item.input] : []);
    const created = await runAction(
      (db2, actor) => products.map((product) => createProduct(db2, actor, product)),
      { success: "productImport.success", successParams: { count: products.length }, key: "product-csv-import" },
    );
    if (created) handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("productImport.title")}</DialogTitle>
          <DialogDescription>{t("productImport.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-muted/30 p-4">
            <FileSpreadsheet className="h-8 w-8 shrink-0 text-primary" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium">{t("productImport.chooseFile")}</p>
              <p className="text-xs text-muted-foreground">{t("productImport.fileHint")}</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.xlsm,.xlsb,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-label={t("productImport.chooseFile")}
              className="block w-full max-w-xs text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:font-medium file:text-primary-foreground hover:file:opacity-90"
              onChange={(event) => void handleFile(event)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => descargarCsv("plantilla-productos-nexora.csv", [[
                "Producto", "Referencia", "Marca", "Categoría", "Descripción",
                "Enlace de imagen", "Precio", "Costo", "Stock mínimo", "Características técnicas",
              ]])}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {t("productImport.downloadTemplate")}
            </Button>
          </div>

          {fileError ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {fileError}
            </p>
          ) : null}

          {fileName ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium">{fileName}</p>
                <Button type="button" size="sm" variant="ghost" onClick={reset}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t("productImport.changeFile")}
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-border/70 p-3">
                  <p className="text-xs text-muted-foreground">{t("productImport.ready")}</p>
                  <p className="text-2xl font-semibold text-primary">{readyRows.length}</p>
                </div>
                <div className="rounded-xl border border-border/70 p-3">
                  <p className="text-xs text-muted-foreground">{t("productImport.duplicates")}</p>
                  <p className="text-2xl font-semibold">{duplicateCount}</p>
                </div>
                <div className="rounded-xl border border-border/70 p-3">
                  <p className="text-xs text-muted-foreground">{t("productImport.review")}</p>
                  <p className="text-2xl font-semibold">{invalidCount}</p>
                </div>
              </div>

              <div className="rounded-xl border border-border/70">
                <div className="border-b border-border/70 px-3 py-2 text-sm font-medium">
                  {t("productImport.preview", { count: preparedRows.length })}
                </div>
                <div className="max-h-64 overflow-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">{t("productImport.row")}</th>
                        <th className="px-3 py-2">{t("product.name")}</th>
                        <th className="px-3 py-2">{t("product.sku")}</th>
                        <th className="px-3 py-2">{t("productImport.status")}</th>
                        <th className="px-3 py-2">{t("productImport.observation")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preparedRows.slice(0, 100).map((item) => (
                        <tr key={item.row.rowNumber} className="border-t border-border/50 align-top">
                          <td className="px-3 py-2 tabular-nums">{item.row.rowNumber}</td>
                          <td className="max-w-56 px-3 py-2">{item.row.name || "—"}</td>
                          <td className="px-3 py-2 font-mono text-xs">{item.row.sku || t("productImport.generatedSku")}</td>
                          <td className="px-3 py-2">
                            <span className={item.status === "ready" ? "text-success" : item.status === "duplicate" ? "text-warning" : "text-destructive"}>
                              {t(`productImport.status.${item.status}`)}
                            </span>
                          </td>
                          <td className="max-w-72 whitespace-normal px-3 py-2 text-xs text-muted-foreground">
                            {item.reason ?? (item.status === "ready" ? t("productImport.rowReady") : "")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preparedRows.length > 100 ? (
                  <p className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
                    {t("productImport.previewLimit", { count: preparedRows.length - 100 })}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}

          <p className="rounded-lg border border-info/20 bg-info/5 p-3 text-xs text-muted-foreground">
            {t("productImport.stockNotice")}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" loading={runAction.pending} disabled={!readyRows.length || runAction.pending} onClick={() => void importProducts()}>
            <FileUp className="mr-2 h-4 w-4" />
            {t("productImport.importButton", { count: readyRows.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
