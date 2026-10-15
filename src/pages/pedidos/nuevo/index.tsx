import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus, Check, ShoppingCart, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { PageHeader } from "@/components/shared/page-header";
import { OptionSelect } from "@/components/shared/option-select";
import { ConditionBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import { createOrder, condicionParaProducto, type PedidoLineaInput } from "@/lib/actions/orders";
import type { CustomerCategoriaMayorista, ProductCategory, UnitCondition } from "@/lib/types";
import { compararProductos } from "@/lib/product-order";
import { etiquetaTipoProducto, TIPOS_SIN_CONDICION, tiposProductoOrdenados } from "@/lib/products";
import { SEARCH_INPUT_PROPS } from "@/lib/search-input";
import { cn } from "@/lib/utils";

/** Creación de pedidos a clientes mayoristas por referencias y cantidades. */
const NuevoPedido = () => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const navigate = useNavigate();

  const [customerId, setCustomerId] = useState("");
  const [categoria, setCategoria] = useState<ProductCategory>("celular");
  const [condicion, setCondicion] = useState<UnitCondition>("nuevo");
  const [busqueda, setBusqueda] = useState("");
  const [lineas, setLineas] = useState<Array<{ productId: string; quantity: number; condition: UnitCondition }>>([]);
  // Mientras se escribe la cantidad a mano, se guarda el texto tal cual (puede estar vacío o
  // fuera de rango a medio escribir) para no interrumpir al usuario; se ajusta al salir del
  // campo o al pulsar Enter.
  const [cantidadEnEdicion, setCantidadEnEdicion] = useState<Record<string, string>>({});
  const [creando, setCreando] = useState(false);
  // Por defecto no se muestran las referencias agotadas (sin unidades disponibles).
  const [soloConStock, setSoloConStock] = useState(true);
  // Familia/modelo elegido para acortar la lista ("" = todas).
  const [familia, setFamilia] = useState("");

  const [clienteFiltro, setClienteFiltro] = useState<CustomerCategoriaMayorista | undefined>(undefined);
  const mayoristas = db.customers
    .filter((c) => c.isActive && c.tipo === "mayorista")
    .filter((c) => {
      if (!clienteFiltro) return true;
      const propia = c.categoriaMayorista ?? "ambos";
      return propia === clienteFiltro || propia === "ambos";
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const cliente = mayoristas.find((c) => c.id === customerId);

  const enPedidoActivo = (unitId: string) =>
    db.orderItemUnits.some((row) => {
      if (row.unitId !== unitId) return false;
      const item = db.orderItems.find((i) => i.id === row.orderItemId);
      const order = item ? db.orders.find((o) => o.id === item.orderId) : undefined;
      return order && order.status === "en_preparacion";
    });

  const disponiblesDe = (productId: string, cond: UnitCondition | undefined) =>
    db.units.filter(
      (unit) =>
        unit.productId === productId &&
        // en_bodega y en_local: ambos están "disponibles para venta" según su propia
        // definición (ver UnitStatus en types.ts). Antes solo se contaba en_bodega, así que
        // un equipo que volvía de garantía a en_local quedaba invisible para pedidos.
        (unit.status === "en_bodega" || unit.status === "en_local") &&
        !enPedidoActivo(unit.id) &&
        (cond ? unit.condition === cond : true),
    ).length;

  const categorias = useMemo(
    () =>
      tiposProductoOrdenados(db).map((tipo) => ({
        value: tipo.key,
        label: etiquetaTipoProducto(t, tipo),
        condicionVisible: !TIPOS_SIN_CONDICION.has(tipo.key),
      })),
    [db, t],
  );

  const condicionVisible = () => {
    const cat = categorias.find((c) => c.value === categoria);
    return cat?.condicionVisible ?? false;
  };

  const referencias = useMemo(() => {
    const needle = busqueda.trim().toLowerCase();
    const cond = condicionVisible() ? condicion : undefined;
    return db.products
      .filter((p) => p.isActive)
      .filter((p) => (p.categoria ?? "celular") === categoria || (p.categoria === "tablet" && categoria === "celular"))
      .filter(
        (p) =>
          !needle ||
          p.name.toLowerCase().includes(needle) ||
          (p.sku ?? "").toLowerCase().includes(needle),
      )
      .map((p) => ({ product: p, disponibles: disponiblesDe(p.id, cond) }))
      .sort((a, b) => compararProductos(a.product, b.product));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, categoria, condicion, busqueda, lineas]);

  const condicionDe = (product: { categoria?: ProductCategory }) =>
    condicionVisible() ? condicion : condicionParaProducto(product.categoria);
  const cantidadEnPedido = (product: { id: string; categoria?: ProductCategory }) =>
    lineas.find((l) => l.productId === product.id && l.condition === condicionDe(product))?.quantity ?? 0;

  // Familia de un producto: su nombre sin la marca, hasta el primer número ("iPhone 12 Pro 128 GB"
  // -> "iPhone 12"). Sirve para ofrecer fichas por modelo y no mostrar todo de una vez.
  const marcas = useMemo(() => new Set(db.brands.map((b) => b.name.toLowerCase())), [db.brands]);
  const familiaDe = (name: string) => {
    const palabras = name.trim().split(/\s+/);
    let inicio = 0;
    while (inicio < palabras.length - 1 && marcas.has(palabras[inicio].toLowerCase())) inicio += 1;
    const resto = palabras.slice(inicio);
    const numero = resto.findIndex((palabra) => /\d/.test(palabra));
    const largo = numero >= 0 ? numero + 1 : Math.min(2, resto.length);
    const etiqueta = resto.slice(0, Math.max(largo, 1)).join(" ");
    return { clave: etiqueta.toLowerCase(), etiqueta };
  };

  const buscando = busqueda.trim() !== "";
  // Lo agotado se oculta (salvo lo que ya está en el pedido, para no perderlo de vista).
  const sinAgotados = referencias.filter(
    (r) => !soloConStock || r.disponibles > 0 || cantidadEnPedido(r.product) > 0,
  );
  const familias = (() => {
    const mapa = new Map<string, { etiqueta: string; cantidad: number }>();
    for (const r of sinAgotados) {
      const f = familiaDe(r.product.name);
      const actual = mapa.get(f.clave);
      if (actual) actual.cantidad += 1;
      else mapa.set(f.clave, { etiqueta: f.etiqueta, cantidad: 1 });
    }
    return [...mapa.entries()].map(([clave, datos]) => ({ clave, ...datos }));
  })();
  // Buscar siempre mira todas las familias; las fichas solo acortan la lista sin búsqueda.
  const familiaActiva = !buscando && familias.some((f) => f.clave === familia) ? familia : "";
  const lista = familiaActiva
    ? sinAgotados.filter((r) => familiaDe(r.product.name).clave === familiaActiva)
    : sinAgotados;

  const clienteCompatible = () => {
    if (!cliente || !cliente.categoriaMayorista) return true;
    // "categoria" es el filtro elegido para buscar referencias (Celulares/Repuestos/...), no
    // el de un producto ya elegido: se mira a qué grupo mayorista pertenece ese tipo.
    const grupo = db.productTypes.find((tipo) => tipo.key === categoria)?.mayoristaGroup ?? "celulares";
    if (grupo === "repuestos") return cliente.categoriaMayorista === "repuestos" || cliente.categoriaMayorista === "ambos";
    return cliente.categoriaMayorista === "celulares" || cliente.categoriaMayorista === "ambos";
  };

  const agregar = (productId: string) => {
    const product = db.products.find((p) => p.id === productId);
    if (!product) return;
    const cond = condicionVisible() ? condicion : condicionParaProducto(product.categoria);
    setLineas((previous) => {
      const existente = previous.find((l) => l.productId === productId && l.condition === cond);
      if (existente) {
        return previous.map((l) =>
          l === existente ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...previous, { productId, quantity: 1, condition: cond }];
    });
  };

  const cambiarCantidad = (productId: string, condition: UnitCondition, delta: number) =>
    setLineas((previous) =>
      previous
        .map((l) =>
          l.productId === productId && l.condition === condition
            ? { ...l, quantity: l.quantity + delta }
            : l,
        )
        .filter((l) => l.quantity > 0),
    );

  /** Deja la cantidad escrita a mano entre 1 y lo disponible; fuera de ese rango, la ajusta. */
  const fijarCantidad = (productId: string, condition: UnitCondition, valor: number) => {
    const tope = disponiblesDe(productId, condicionVisible() ? condition : undefined);
    const cantidad = Math.min(Math.max(Math.round(valor) || 1, 1), Math.max(tope, 1));
    setLineas((previous) =>
      previous.map((l) => (l.productId === productId && l.condition === condition ? { ...l, quantity: cantidad } : l)),
    );
  };

  const totalReferencias = lineas.reduce((sum, l) => sum + l.quantity, 0);

  const confirmar = async () => {
    setCreando(true);
    const lineasPedido: PedidoLineaInput[] = lineas.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      condition: l.condition,
    }));
    const order = await runAction(
      (db2, actor) => createOrder(db2, actor, { customerId, lineas: lineasPedido }),
      { success: "order.created", weighty: true },
    );
    setCreando(false);
    if (order) navigate(`/pedidos/${order.id}`);
  };

  return (
    <>
      <div className="space-y-5 stagger">
        <Button variant="ghost" size="sm" asChild className="-ml-2 w-fit">
          <Link to="/pedidos">
            <ArrowLeft />
            {t("order.backToList")}
          </Link>
        </Button>

        <PageHeader title={t("order.createTitle")} description={t("order.mayoristaSubtitle")} />

        <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
          <div className="grid items-start gap-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
            <div className="space-y-2">
              <Label>{t("order.customer")}</Label>
              <div className="flex flex-wrap gap-2">
                {([undefined, "celulares", "repuestos", "ambos"] as const).map((opcion) => (
                  <Button
                    key={opcion ?? "todos"}
                    type="button"
                    size="sm"
                    variant={clienteFiltro === opcion ? "default" : "outline"}
                    aria-label={opcion ? t("order.customerFilterAria", { categoria: t(`customerCat.${opcion}Corto`) }) : t("order.customerFilterAriaAll")}
                    onClick={() => {
                      setClienteFiltro(opcion);
                      // El cliente elegido puede quedar fuera del nuevo filtro; se limpia para no
                      // dejar seleccionado a alguien que ya no se ve en la lista.
                      setCustomerId((actual) => {
                        const sigueVisible = db.customers.some((c) => {
                          if (c.id !== actual) return false;
                          if (!opcion) return true;
                          const propia = c.categoriaMayorista ?? "ambos";
                          return propia === opcion || propia === "ambos";
                        });
                        return sigueVisible ? actual : "";
                      });
                    }}
                  >
                    {opcion ? t(`customerCat.${opcion}Corto`) : t("customer.filterAll")}
                  </Button>
                ))}
              </div>
            </div>
            <OptionSelect
              value={customerId}
              onChange={setCustomerId}
              options={mayoristas.map((c) => ({
                value: c.id,
                label: `${c.name}${c.categoriaMayorista ? ` · ${t(`customerCat.${c.categoriaMayorista}`)}` : ""}`,
              }))}
              placeholder={t("order.selectCustomer")}
              emptyLabel={t("order.selectCustomer")}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3">
            <div className="flex flex-wrap gap-2">
              {categorias.map((cat) => (
                <Button
                  key={cat.value}
                  variant={categoria === cat.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setCategoria(cat.value);
                    setCondicion("nuevo");
                    setFamilia("");
                  }}
                >
                  {cat.label}
                </Button>
              ))}
            </div>

            {condicionVisible() ? (
              <div className="flex gap-1 rounded-md border bg-muted/40 p-0.5">
                {(["nuevo", "seminuevo"] as UnitCondition[]).map((value) => (
                  <Button
                    key={value}
                    variant={condicion === value ? "default" : "ghost"}
                    size="sm"
                    className="h-7 px-3"
                    onClick={() => setCondicion(value)}
                  >
                    {t(`condition.${value}`)}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              {...SEARCH_INPUT_PROPS}
              value={busqueda}
              placeholder={t("product.searchPlaceholder")}
              onChange={(event) => setBusqueda(event.target.value)}
              onKeyDown={(event) => {
                // Enter agrega la referencia cuando la búsqueda deja una sola.
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                const unica = lista.length === 1 ? lista[0] : undefined;
                if (unica && cliente && clienteCompatible() && unica.disponibles > 0) {
                  agregar(unica.product.id);
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant={soloConStock ? "default" : "outline"}
              aria-pressed={soloConStock}
              className="h-10 shrink-0"
              onClick={() => setSoloConStock((previous) => !previous)}
            >
              {soloConStock ? <Check /> : null}
              {t("order.soloConStock")}
            </Button>
          </div>

          {cliente && !clienteCompatible() ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              {t("order.clienteCategoriaIncompatible")}
            </p>
          ) : null}
        </section>

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{t("order.browseTitle")}</h3>
              <span className="font-tabular text-xs text-muted-foreground">
                {t("order.refsShown", { count: lista.length })}
              </span>
            </div>

            {!buscando && familias.length > 1 ? (
              <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {[{ clave: "", etiqueta: t("order.familyAll"), cantidad: sinAgotados.length }, ...familias].map(
                  (f) => (
                    <button
                      key={f.clave || "todas"}
                      type="button"
                      aria-pressed={familiaActiva === f.clave}
                      onClick={() => setFamilia(f.clave)}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        familiaActiva === f.clave
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-background hover:bg-muted",
                      )}
                    >
                      {f.etiqueta}
                      <span
                        className={cn(
                          "font-tabular rounded-full px-1.5 text-[10px]",
                          familiaActiva === f.clave ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {f.cantidad}
                      </span>
                    </button>
                  ),
                )}
              </div>
            ) : null}

            {lista.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-8 text-center">
                <p className="text-sm font-medium">{t("order.noRefsMatch")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("order.noRefsMatchHint")}</p>
              </div>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 lg:max-h-[calc(100vh-22rem)] lg:min-h-[18rem] lg:overflow-y-auto lg:pr-1">
                {lista.map(({ product, disponibles }) => {
                  const enPedido = cantidadEnPedido(product);
                  return (
                    <li
                      key={product.id}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-lg border bg-card p-3 transition-[border-color,box-shadow,transform] duration-200 motion-reduce:transition-none [@media(hover:hover)]:hover:-translate-y-0.5 hover:shadow-elegant motion-reduce:[@media(hover:hover)]:hover:translate-y-0",
                        enPedido > 0 && "border-primary/50 bg-primary/5",
                        disponibles === 0 && "opacity-60",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t("order.availableInBodega", { count: disponibles })}
                        </p>
                        {enPedido > 0 ? (
                          <span className="font-tabular mt-1 inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            {t("order.inOrder", { count: enPedido })}
                          </span>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        aria-label={t("order.addToOrder", { name: product.name })}
                        disabled={!cliente || !clienteCompatible() || disponibles === 0}
                        onClick={() => agregar(product.id)}
                      >
                        <Plus />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div
            id="pedido-actual"
            className="flex flex-col rounded-lg border bg-card p-4 shadow-sm lg:sticky lg:top-20 lg:max-h-[calc(100vh-7rem)]"
          >
            <h3 className="mb-3 shrink-0 text-sm font-semibold">
              {t("order.currentOrder")}{" "}
              <span className="font-normal text-muted-foreground">({t("order.referencesCount", { count: totalReferencias })})</span>
            </h3>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {lineas.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("order.noReferences")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {lineas.map((linea) => {
                    const product = db.products.find((p) => p.id === linea.productId);
                    const disponibles = disponiblesDe(linea.productId, condicionVisible() ? linea.condition : undefined);
                    return (
                      <li key={`${linea.productId}-${linea.condition}`} className="rounded-md border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{product?.name}</p>
                            <div className="mt-1">
                              <ConditionBadge condition={linea.condition} />
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button type="button" size="icon" variant="outline" className="h-7 w-7"
                              disabled={linea.quantity <= 1} onClick={() => cambiarCantidad(linea.productId, linea.condition, -1)}>
                              −
                            </Button>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              aria-label={t("order.quantity")}
                              className="font-tabular h-7 w-14 px-1 text-center text-sm"
                              value={cantidadEnEdicion[`${linea.productId}-${linea.condition}`] ?? String(linea.quantity)}
                              onChange={(event) => {
                                // Solo dígitos; se permite dejarlo vacío mientras se escribe.
                                const limpio = event.target.value.replace(/[^0-9]/g, "");
                                setCantidadEnEdicion((previous) => ({
                                  ...previous,
                                  [`${linea.productId}-${linea.condition}`]: limpio,
                                }));
                              }}
                              onBlur={() => {
                                const clave = `${linea.productId}-${linea.condition}`;
                                fijarCantidad(linea.productId, linea.condition, Number(cantidadEnEdicion[clave] ?? linea.quantity));
                                setCantidadEnEdicion((previous) => {
                                  const { [clave]: _omitido, ...resto } = previous;
                                  return resto;
                                });
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") event.currentTarget.blur();
                              }}
                            />
                            <Button type="button" size="icon" variant="outline" className="h-7 w-7"
                              disabled={linea.quantity >= disponibles} onClick={() => cambiarCantidad(linea.productId, linea.condition, 1)}>
                              +
                            </Button>
                            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                              onClick={() => setLineas((previous) => previous.filter((l) => l !== linea))}>
                              <Trash2 />
                            </Button>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("order.stockOf", { available: disponibles })}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <Button
              type="button"
              className="mt-4 w-full shrink-0"
              loading={creando}
              disabled={!customerId || lineas.length === 0 || !clienteCompatible()}
              onClick={() => void confirmar()}
            >
              <Check />
              {t("order.confirmOrder")}
            </Button>
          </div>
        </section>
      </div>

      {/* Celular: barra fija con el total para ir al pedido sin buscarlo al final de la lista. */}
      {lineas.length > 0 ? (
        <div className="fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 lg:hidden">
          <Button
            type="button"
            className="w-full justify-between shadow-elegant"
            onClick={() =>
              document.getElementById("pedido-actual")?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            <span className="flex items-center gap-2">
              <ShoppingCart />
              {t("order.referencesCount", { count: totalReferencias })}
            </span>
            <span>{t("order.viewOrder")}</span>
          </Button>
        </div>
      ) : null}
    </>
  );
};

export default NuevoPedido;
