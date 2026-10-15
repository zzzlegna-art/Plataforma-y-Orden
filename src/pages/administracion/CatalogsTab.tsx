import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRunAction } from "@/hooks/use-run-action";
import { onEnter } from "@/lib/keys";
import { useStore } from "@/hooks/use-store";
import {
  createBrand,
  createCategory,
  createProductType,
  deleteBrand,
  deleteCategory,
  deleteProductType,
  updateBrand,
  updateCategory,
  updateProductType,
} from "@/lib/actions/catalogs";
import { TIPOS_PRODUCTO_FIJOS, etiquetaTipoProducto, tiposProductoOrdenados } from "@/lib/products";
import type { ProductType } from "@/lib/types";
import { cn } from "@/lib/utils";

const CatalogRow = ({
  name,
  usageCount,
  onRename,
  onDelete,
}: {
  name: string;
  usageCount: number;
  onRename: (name: string) => void;
  onDelete: () => void;
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  const commit = () => {
    const next = value.trim();
    setEditing(false);
    if (!next || next === name) {
      setValue(name);
      return;
    }
    onRename(next);
  };

  return (
    <li className="flex items-center gap-2 border-b px-3 py-2 last:border-0">
      {editing ? (
        <>
          <Input
            value={value}
            autoFocus
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") {
                setValue(name);
                setEditing(false);
              }
            }}
            className="h-8"
          />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={commit}>
            <Check />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => {
              setValue(name);
              setEditing(false);
            }}
          >
            <X />
          </Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("catalog.usage", { count: usageCount })}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label={t("common.edit")}
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive"
                aria-label={t("common.delete")}
                disabled={usageCount > 0}
              >
                <Trash2 />
              </Button>
            }
            title={t("catalog.deleteTitle")}
            description={t("catalog.deleteDescription")}
            destructive
            confirmLabel={t("common.delete")}
            onConfirm={onDelete}
          />
        </>
      )}
    </li>
  );
};

/** Fila de un tipo de producto: nombre, a qué grupo mayorista pertenece, y usos. Los 5 tipos
 * de siempre (celular, tablet, reloj, audífono, repuesto) no se pueden borrar ni cambiarles
 * el grupo, para no alterar cómo ya funcionan hoy. */
const ProductTypeRow = ({
  tipo,
  usageCount,
  onRename,
  onCambiarGrupo,
  onDelete,
}: {
  tipo: ProductType;
  usageCount: number;
  onRename: (name: string) => void;
  onCambiarGrupo: (grupo: "celulares" | "repuestos") => void;
  onDelete: () => void;
}) => {
  const { t } = useTranslation();
  const esFijo = Boolean(TIPOS_PRODUCTO_FIJOS[tipo.key]);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(tipo.name);

  const commit = () => {
    const next = value.trim();
    setEditing(false);
    if (!next || next === tipo.name) {
      setValue(tipo.name);
      return;
    }
    onRename(next);
  };

  return (
    <li className="flex flex-wrap items-center gap-2 border-b px-3 py-2 last:border-0">
      {editing ? (
        <>
          <Input
            value={value}
            autoFocus
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") {
                setValue(tipo.name);
                setEditing(false);
              }
            }}
            className="h-8"
          />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={commit}>
            <Check />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => {
              setValue(tipo.name);
              setEditing(false);
            }}
          >
            <X />
          </Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-sm">{etiquetaTipoProducto(t, tipo)}</span>
          <div className="flex shrink-0 gap-1 rounded-md border bg-muted/40 p-0.5">
            {(["celulares", "repuestos"] as const).map((grupo) => (
              <button
                key={grupo}
                type="button"
                disabled={esFijo}
                onClick={() => onCambiarGrupo(grupo)}
                className={cn(
                  "rounded px-2 py-0.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  tipo.mayoristaGroup === grupo
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                )}
              >
                {t(`customerCat.${grupo}Corto`)}
              </button>
            ))}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("catalog.usage", { count: usageCount })}
          </span>
          {esFijo ? (
            <span className="shrink-0 text-xs text-muted-foreground">{t("catalog.builtIn")}</span>
          ) : (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label={t("common.edit")}
                onClick={() => setEditing(true)}
              >
                <Pencil />
              </Button>
              <ConfirmDialog
                trigger={
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    aria-label={t("common.delete")}
                    disabled={usageCount > 0}
                  >
                    <Trash2 />
                  </Button>
                }
                title={t("catalog.deleteTitle")}
                description={t("catalog.deleteDescription")}
                destructive
                confirmLabel={t("common.delete")}
                onConfirm={onDelete}
              />
            </>
          )}
        </>
      )}
    </li>
  );
};

/** Catálogos de categorías, marcas y tipos de producto. */
export const CatalogsTab = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const [categoryName, setCategoryName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [tipoName, setTipoName] = useState("");
  const [tipoGrupo, setTipoGrupo] = useState<"celulares" | "repuestos">("celulares");

  const crearCategoria = async () => {
    const result = await runAction(
      (db2, actor) => createCategory(db2, actor, { name: categoryName }),
      { success: "catalog.created" },
    );
    if (result) setCategoryName("");
  };

  const crearMarca = async () => {
    const result = await runAction(
      (db2, actor) => createBrand(db2, actor, { name: brandName }),
      { success: "catalog.created" },
    );
    if (result) setBrandName("");
  };

  const crearTipo = async () => {
    const result = await runAction(
      (db2, actor) => createProductType(db2, actor, { name: tipoName, mayoristaGroup: tipoGrupo }),
      { success: "catalog.created" },
    );
    if (result) {
      setTipoName("");
      setTipoGrupo("celulares");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">{t("catalog.categories")}</h3>
        <p className="mb-3 text-xs text-muted-foreground">{t("catalog.categoriesHint")}</p>
        <div className="mb-3 flex gap-2" onKeyDown={onEnter(crearCategoria)}>
          <Input
            value={categoryName}
            placeholder={t("catalog.newCategory")}
            onChange={(event) => setCategoryName(event.target.value)}
          />
          <Button type="button" loading={runAction.pending} onClick={() => void crearCategoria()}>
            <Plus />
          </Button>
        </div>
        <ul className="rounded-md border">
          {db.categories.map((category) => (
            <CatalogRow
              key={category.id}
              name={category.name}
              usageCount={db.products.filter((product) => product.categoryId === category.id).length}
              onRename={(name) =>
                void runAction(
                  (db2, actor) => updateCategory(db2, actor, { id: category.id, name }),
                  { success: "catalog.updated" },
                )
              }
              onDelete={() =>
                void runAction(
                  (db2, actor) => deleteCategory(db2, actor, { id: category.id }),
                  { success: "catalog.deleted" },
                )
              }
            />
          ))}
        </ul>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">{t("catalog.brands")}</h3>
        <p className="mb-3 text-xs text-muted-foreground">{t("catalog.brandsHint")}</p>
        <div className="mb-3 flex gap-2" onKeyDown={onEnter(crearMarca)}>
          <Input
            value={brandName}
            placeholder={t("catalog.newBrand")}
            onChange={(event) => setBrandName(event.target.value)}
          />
          <Button type="button" loading={runAction.pending} onClick={() => void crearMarca()}>
            <Plus />
          </Button>
        </div>
        <ul className="rounded-md border">
          {db.brands.map((brand) => (
            <CatalogRow
              key={brand.id}
              name={brand.name}
              usageCount={db.products.filter((product) => product.brandId === brand.id).length}
              onRename={(name) =>
                void runAction(
                  (db2, actor) => updateBrand(db2, actor, { id: brand.id, name }),
                  { success: "catalog.updated" },
                )
              }
              onDelete={() =>
                void runAction((db2, actor) => deleteBrand(db2, actor, { id: brand.id }), {
                  success: "catalog.deleted",
                })
              }
            />
          ))}
        </ul>
      </section>

      <section className="rounded-lg border bg-card p-4 lg:col-span-2">
        <h3 className="text-sm font-semibold">{t("catalog.productTypes")}</h3>
        <p className="mb-3 text-xs text-muted-foreground">{t("catalog.productTypesHint")}</p>
        <div className="mb-3 flex flex-wrap gap-2" onKeyDown={onEnter(crearTipo)}>
          <Input
            value={tipoName}
            placeholder={t("catalog.newProductType")}
            onChange={(event) => setTipoName(event.target.value)}
            className="max-w-xs"
          />
          <div className="flex gap-1 rounded-md border bg-muted/40 p-0.5">
            {(["celulares", "repuestos"] as const).map((grupo) => (
              <button
                key={grupo}
                type="button"
                onClick={() => setTipoGrupo(grupo)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium transition-colors",
                  tipoGrupo === grupo ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {t(`customerCat.${grupo}Corto`)}
              </button>
            ))}
          </div>
          <Button type="button" loading={runAction.pending} onClick={() => void crearTipo()}>
            <Plus />
            {t("catalog.newProductType")}
          </Button>
        </div>
        <ul className="rounded-md border">
          {tiposProductoOrdenados(db).map((tipo) => (
            <ProductTypeRow
              key={tipo.id}
              tipo={tipo}
              usageCount={db.products.filter((product) => product.categoria === tipo.key).length}
              onRename={(name) =>
                void runAction(
                  (db2, actor) =>
                    updateProductType(db2, actor, { id: tipo.id, name, mayoristaGroup: tipo.mayoristaGroup }),
                  { success: "catalog.updated" },
                )
              }
              onCambiarGrupo={(mayoristaGroup) =>
                void runAction(
                  (db2, actor) => updateProductType(db2, actor, { id: tipo.id, name: tipo.name, mayoristaGroup }),
                  { success: "catalog.updated" },
                )
              }
              onDelete={() =>
                void runAction((db2, actor) => deleteProductType(db2, actor, { id: tipo.id }), {
                  success: "catalog.deleted",
                })
              }
            />
          ))}
        </ul>
      </section>
    </div>
  );
};
