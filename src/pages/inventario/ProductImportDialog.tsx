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
): ProductTechnicalSpecs | und¶»§q«^