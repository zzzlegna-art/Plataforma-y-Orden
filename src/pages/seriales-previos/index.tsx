import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SerialScanInput } from "@/components/shared/serial-scan-input";
import { SearchField } from "@/components/shared/search-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/use-permissions";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import { eliminarSerialPrevio } from "@/lib/actions/seriales-previos";
import { importarSerialesPreviosEnLote, importarVentasPreviasEnLote } from "@/lib/backend";
import { DomainError } from "@/lib/db";
import { formatDate } from "@/lib/format";
import {
  MAX_SERIAL_IMPORT,
  MAX_SERIAL_IMPORT_FILE_BYTES,
  parseSerialWorkbook,
  SerialWorkbookError,
  type ParsedSerialWorkbook,
} from "@/lib/seriales-previos-excel";
import { buscarSerialPrevio, listarSerialesPrevios } from "@/lib/selectors";

type Tab = "buscar" | "importar" | "lista";

type ArchivoExcelEnCola = ParsedSerialWorkbook & {
  id: string;
  nombre: string;
  clientePorDefecto: string;
  fechaVentaPorDefecto: string;
};

/** Registro de ventas anteriores a la plataforma (seriales previos). */
const SerialesPrevios = ({ embedded = false }: { embedded?: boolean }) => {
  const { t } = useTranslation();
  const { db, refrescar } = useStore();
  const runAction = useRunAction();
  const { isAdmin } = usePermissions();

  const [tab, setTab] = useState<Tab>("buscar");
  const [buscado, setBuscado] = useState<string | null>(null);
  const [textoImportar, setTextoImportar] = useState("");
  const [resultadoImport, setResultadoImport] = useState<{ importados: number; duplicados: number } | null>(null);
  const [busquedaLista, setBusquedaLista] = useState("");
  const [archivosExcel, setArchivosExcel] = useState<ArchivoExcelEnCola[]>([]);
  const [errorExcel, setErrorExcel] = useState<string | null>(null);
  const [leyendoExcel, setLeyendoExcel] = useState(false);
  const [importandoExcel, setImportandoExcel] = useState(false);
  const [importandoManual, setImportandoManual] = useState(false);
  const [resultadoExcel, setResultadoExcel] = useState<{
    leidos: number;
    importados: number;
    duplicados: number;
    archivos: number;
  } | null>(null);
  const [paginaLista, setPaginaLista] = useState(0);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const tamanoPagina = 100;

  const encontrado = useMemo(
    () => (buscado ? buscarSerialPrevio(db, buscado) : undefined),
    [db, buscado],
  );

  const lista = useMemo(() => listarSerialesPrevios(db, busquedaLista), [db, busquedaLista]);
  const listaPagina = useMemo(
    () => lista.slice(paginaLista * tamanoPagina, (paginaLista + 1) * tamanoPagina),
    [lista, paginaLista],
  );
  const totalPaginas = Math.max(1, Math.ceil(lista.length / tamanoPagina));
  const serialesExistentes = useMemo(
    () => new Set([
      ...db.serialesPrevios.map((item) => item.serial.trim().toLowerCase()),
      ...db.units.map((item) => item.serial.trim().toLowerCase()),
      ...db.receptionItems.map((item) => item.serial.trim().toLowerCase()),
    ]),
    [db.serialesPrevios, db.units, db.receptionItems],
  );
  const registrosEnCola = useMemo(
    () => archivosExcel.flatMap((archivo) =>
      archivo.registros.map((registro) => ({
        serial: registro.serial,
        referencia: registro.referencia,
        cliente: registro.cliente || archivo.clientePorDefecto || undefined,
        fechaVenta: registro.fechaVenta || archivo.fechaVentaPorDefecto || undefined,
        archivoOrigen: archivo.nombre,
        hojaOrigen: registro.hoja,
        filaOrigen: registro.fila,
      })),
    ),
    [archivosExcel],
  );
  const estadisticasExcel = useMemo(() => {
    if (archivosExcel.length === 0) return null;
    const vistos = new Set<string>();
    let nuevos = 0;
    let duplicados = 0;
    for (const registro of registrosEnCola) {
      const clave = registro.serial.trim().toLowerCase();
      if (!clave || vistos.has(clave) || serialesExistentes.has(clave)) {
        duplicados += 1;
        continue;
      }
      vistos.add(clave);
      nuevos += 1;
    }
    return { leidos: registrosEnCola.length, nuevos, duplicados };
  }, [archivosExcel.length, registrosEnCola, serialesExistentes]);

  useEffect(() => {
    setPaginaLista(0);
  }, [busquedaLista]);

  useEffect(() => {
    setPaginaLista((pagina) => Math.min(pagina, totalPaginas - 1));
  }, [totalPaginas]);

  const cargarExcels = async (files: File[]) => {
    if (files.length === 0) return;
    setErrorExcel(null);
    setResultadoExcel(null);
    setLeyendoExcel(true);

    const nuevos: ArchivoExcelEnCola[] = [];
    const errores: string[] = [];
    const huellas = new Set(archivosExcel.map((archivo) => archivo.id));

    try {
      for (const file of files) {
        const extension = file.name.toLowerCase().split(".").pop();
        if (!extension || !["xlsx", "xls", "xlsm", "xlsb", "csv"].includes(extension)) {
          errores.push(`${file.name}: formato no compatible`);
          continue;
        }
        if (file.size > MAX_SERIAL_IMPORT_FILE_BYTES) {
          errores.push(`${file.name}: supera el límite de 25 MB`);
          continue;
        }

        const id = `${file.name}:${file.size}:${file.lastModified}`;
        if (huellas.has(id)) {
          errores.push(`${file.name}: ya está en la lista; quítalo con la X si necesitas volver a seleccionarlo`);
          continue;
        }

        try {
          const parsed = parseSerialWorkbook(await file.arrayBuffer(), file.name);
          nuevos.push({
            ...parsed,
            id,
            nombre: file.name,
            clientePorDefecto: parsed.clienteDetectado ?? "",
            fechaVentaPorDefecto: parsed.fechaVentaDetectada ?? "",
          });
          huellas.add(id);
        } catch (error) {
          if (error instanceof SerialWorkbookError) {
            const claves: Record<SerialWorkbookError["code"], string> = {
              empty: "serialesPrevios.excelErrorEmpty",
              too_many: "serialesPrevios.excelErrorTooMany",
              unsafe_number: "serialesPrevios.excelErrorUnsafeNumber",
              invalid_file: "serialesPrevios.excelErrorInvalidFile",
            };
            errores.push(`${file.name}: ${t(claves[error.code], { cell: error.detail ?? "" })}`);
          } else {
            errores.push(`${file.name}: ${t("serialesPrevios.excelErrorInvalidFile")}`);
          }
        }
      }

      if (nuevos.length > 0) {
        setArchivosExcel((anteriores) => [...anteriores, ...nuevos]);
      }
      if (errores.length > 0) setErrorExcel(errores.join(" · "));
    } finally {
      setLeyendoExcel(false);
    }
  };

  const importarExcel = async () => {
    if (registrosEnCola.length === 0 || importandoExcel) return;
    setImportandoExcel(true);

    const totalLeidos = registrosEnCola.length;
    const cantidadArchivos = archivosExcel.length;
    let importados = 0;
    let duplicados = 0;
    let procesados = 0;

    try {
      // La RPC acepta 20.000 filas por transacción; los Excel se agrupan en lotes
      // para poder cargar muchos archivos sin enviar un paquete gigante.
      for (let inicio = 0; inicio < registrosEnCola.length; inicio += MAX_SERIAL_IMPORT) {
        const lote = registrosEnCola.slice(inicio, inicio + MAX_SERIAL_IMPORT);
        const resultado = await importarVentasPreviasEnLote(lote);
        importados += resultado.importados;
        duplicados += resultado.duplicados;
        procesados += lote.length;
      }

      await refrescar();
      setResultadoExcel({
        leidos: totalLeidos,
        importados,
        duplicados,
        archivos: cantidadArchivos,
      });
      setArchivosExcel([]);
      setErrorExcel(null);
      if (excelInputRef.current) excelInputRef.current.value = "";
      toast.success(
        `Importación completada: ${importados.toLocaleString("es-CO")} seriales nuevos, ${duplicados.toLocaleString("es-CO")} duplicados omitidos · ${cantidadArchivos} archivo(s)`,
      );
    } catch (error) {
      if (error instanceof DomainError) {
        toast.error(t(error.key, error.params));
      } else {
        toast.error(t("serialesPrevios.excelImportError"));
      }
      if (procesados > 0) {
        toast.warning(
          `Se alcanzaron a procesar ${procesados.toLocaleString("es-CO")} filas. La lista se conserva; al reintentar, Nexora omitirá las que ya quedaron guardadas.`,
        );
      }
    } finally {
      setImportandoExcel(false);
    }
  };

  const importar = async () => {
    if (importandoManual) return;
    const seriales = textoImportar.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (seriales.length === 0) return;
    if (seriales.length > MAX_SERIAL_IMPORT) {
      toast.error(t("serialesPrevios.excelErrorTooMany"));
      return;
    }

    setImportandoManual(true);
    try {
      // El pegado manual usa la misma RPC atómica que Excel: evita un guardado enorme
      // tabla por tabla y mantiene la deduplicación segura en el servidor.
      const resultado = await importarSerialesPreviosEnLote(seriales);
      await refrescar();
      setResultadoImport({
        importados: resultado.importados,
        duplicados: resultado.duplicados,
      });
      setTextoImportar("");
      toast.success(
        t("serialesPrevios.imported", { count: resultado.importados }) +
          (resultado.duplicados > 0
            ? ` · ${t("serialesPrevios.duplicados", { count: resultado.duplicados })}`
            : ""),
      );
    } catch (error) {
      if (error instanceof DomainError) toast.error(t(error.key, error.params));
      else toast.error(t("serialesPrevios.excelImportError"));
    } finally {
      setImportandoManual(false);
    }
  };

  return (
    <div className="space-y-5 stagger">
      {!embedded ? <PageHeader title={t("serialesPrevios.title")} description={t("serialesPrevios.subtitle")} /> : null}

      <div className="flex flex-wrap gap-2">
        {(["buscar", "importar", "lista"] as Tab[]).map((option) => (
          <Button
            key={option}
            variant={tab === option ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(option)}
          >
            {t(`serialesPrevios.tab.${option}`)}
          </Button>
        ))}
      </div>

      {tab === "buscar" ? (
        <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
          <SerialScanInput onScan={setBuscado} hint={t("serialesPrevios.buscarHint")} />
          {buscado ? (
            encontrado ? (
              <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
                <p className="mt-2 font-semibold text-success">
                  {t("serialesPrevios.encontrado")}
                </p>
                <p className="font-tabular mt-1 text-sm">{encontrado.serial}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("serialesPrevios.importadoPor", {
                    fecha: formatDate(encontrado.createdAt),
                    usuario: db.users.find((u) => u.id === encontrado.createdBy)?.fullName ?? "",
                  })}
                </p>
                {encontrado.referencia ? <p className="mt-1 text-sm"><span className="text-muted-foreground">Referencia:</span> {encontrado.referencia}</p> : null}
                {encontrado.cliente ? <p className="mt-1 text-sm"><span className="text-muted-foreground">Cliente:</span> {encontrado.cliente}</p> : null}
                {encontrado.fechaVenta ? <p className="mt-1 text-sm"><span className="text-muted-foreground">Fecha de venta:</span> {encontrado.fechaVenta}</p> : null}
                {encontrado.archivoOrigen ? <p className="mt-1 break-all text-xs text-muted-foreground"><span>Archivo:</span> {encontrado.archivoOrigen}</p> : null}
                {encontrado.notas ? (
                  <p className="mt-1 text-xs text-muted-foreground">"{encontrado.notas}"</p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center">
                <XCircle className="mx-auto h-8 w-8 text-destructive" />
                <p className="mt-2 font-semibold text-destructive">
                  {t("serialesPrevios.noEncontrado")}
                </p>
                <p className="font-tabular mt-1 text-sm">{buscado}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("serialesPrevios.noEncontradoDetail")}
                </p>
              </div>
            )
          ) : null}
        </section>
      ) : null}

      {tab === "importar" ? (
        isAdmin ? (
          <div className="space-y-4">
            <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="space-y-1">
                  <h2 className="font-semibold">{t("serialesPrevios.excelTitle")}</h2>
                  <p className="text-sm text-muted-foreground">{t("serialesPrevios.excelDescription")}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="seriales-previos-excel">Seleccionar archivos de ventas previas</Label>
                <input
                  ref={excelInputRef}
                  id="seriales-previos-excel"
                  type="file"
                  multiple
                  accept=".xlsx,.xls,.xlsm,.xlsb,.csv"
                  disabled={leyendoExcel || importandoExcel}
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = "";
                    if (files.length > 0) void cargarExcels(files);
                  }}
                  className="block w-full rounded-md border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Puedes seleccionar muchos Excel a la vez. Se detectan seriales, referencias, clientes (incluido el nombre de cada hoja) y fechas. Máximo 20.000 seriales por archivo y 25 MB por archivo.
                </p>
              </div>

              {leyendoExcel ? (
                <p className="text-sm text-muted-foreground">Leyendo archivos y detectando columnas…</p>
              ) : null}
              {errorExcel ? (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorExcel}
                </p>
              ) : null}

              {archivosExcel.length > 0 && estadisticasExcel ? (
                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {archivosExcel.length} archivo(s) en la lista · {estadisticasExcel.leidos.toLocaleString("es-CO")} seriales detectados
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Revisa los metadatos y quita con la X cualquier archivo que hayas añadido por error.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={leyendoExcel || importandoExcel}
                      onClick={() => {
                        setArchivosExcel([]);
                        setErrorExcel(null);
                        if (excelInputRef.current) excelInputRef.current.value = "";
                      }}
                    >
                      Vaciar lista
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-md border bg-card p-3">
                      <p className="text-xs text-muted-foreground">Filas leídas</p>
                      <p className="text-xl font-semibold tabular-nums">{estadisticasExcel.leidos.toLocaleString("es-CO")}</p>
                    </div>
                    <div className="rounded-md border bg-card p-3">
                      <p className="text-xs text-muted-foreground">Seriales nuevos</p>
                      <p className="text-xl font-semibold tabular-nums text-success">{estadisticasExcel.nuevos.toLocaleString("es-CO")}</p>
                    </div>
                    <div className="rounded-md border bg-card p-3">
                      <p className="text-xs text-muted-foreground">Duplicados que se omitirán</p>
                      <p className="text-xl font-semibold tabular-nums">{estadisticasExcel.duplicados.toLocaleString("es-CO")}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {archivosExcel.map((archivo, index) => (
                      <div key={archivo.id} className="space-y-3 rounded-md border bg-card p-3">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{archivo.nombre}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {archivo.registros.length.toLocaleString("es-CO")} seriales · {new Set(archivo.registros.map((registro) => registro.cliente).filter(Boolean)).size} clientes detectados · {new Set(archivo.registros.map((registro) => registro.referencia).filter(Boolean)).size} referencias · Hojas: {archivo.hojas.join(", ")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {archivo.columnas.length} columnas detectadas
                            </p>
                            {archivo.columnas.length > 0 ? (
                              <details className="mt-1 text-xs text-muted-foreground">
                                <summary className="cursor-pointer select-none hover:text-foreground">
                                  Ver columnas detectadas
                                </summary>
                                <ul className="mt-2 grid max-h-36 grid-cols-1 gap-1 overflow-y-auto rounded-md bg-muted/30 p-2 sm:grid-cols-2">
                                  {archivo.columnas.map((columna, columnaIndex) => (
                                    <li
                                      key={`${archivo.id}-columna-${columnaIndex}`}
                                      className="truncate"
                                      title={columna}
                                    >
                                      {columna}
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : null}
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0 text-destructive"
                            aria-label={`Quitar ${archivo.nombre} de la lista`}
                            title="Quitar archivo"
                            disabled={importandoExcel}
                            onClick={() => setArchivosExcel((actuales) => actuales.filter((item) => item.id !== archivo.id))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label htmlFor={`cliente-previo-${index}`}>Cliente por defecto (solo si no se detecta en la hoja ni en los datos)</Label>
                            <input
                              id={`cliente-previo-${index}`}
                              type="text"
                              value={archivo.clientePorDefecto}
                              disabled={importandoExcel}
                              placeholder="Nombre del cliente"
                              onChange={(event) => setArchivosExcel((actuales) => actuales.map((item) =>
                                item.id === archivo.id ? { ...item, clientePorDefecto: event.target.value } : item,
                              ))}
                              className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`fecha-previa-${index}`}>Fecha de venta por defecto (opcional)</Label>
                            <input
                              id={`fecha-previa-${index}`}
                              type="date"
                              value={archivo.fechaVentaPorDefecto}
                              disabled={importandoExcel}
                              onChange={(event) => setArchivosExcel((actuales) => actuales.map((item) =>
                                item.id === archivo.id ? { ...item, fechaVentaPorDefecto: event.target.value } : item,
                              ))}
                              className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            />
                          </div>
                        </div>

                        <p className="break-words text-xs text-muted-foreground">
                          Vista previa: {archivo.registros.slice(0, 3).map((registro) =>
                            `${registro.serial} — ${registro.referencia || "Sin referencia"} · ${registro.cliente || archivo.clientePorDefecto || "Sin cliente"} · ${registro.fechaVenta || archivo.fechaVentaPorDefecto || "Sin fecha"}`,
                          ).join(" / ")}
                        </p>
                        {archivo.advertencia ? (
                          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
                            {t(`serialesPrevios.excelWarning.${archivo.advertencia}`)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <Button
                    type="button"
                    loading={importandoExcel}
                    disabled={importandoExcel || leyendoExcel || estadisticasExcel.leidos === 0}
                    onClick={() => void importarExcel()}
                  >
                    <Upload />
                    Importar {estadisticasExcel.leidos.toLocaleString("es-CO")} seriales de {archivosExcel.length} archivo(s)
                  </Button>
                </div>
              ) : null}

              {resultadoExcel ? (
                <p role="status" className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
                  {t("serialesPrevios.excelResult", {
                    leidos: resultadoExcel.leidos,
                    importados: resultadoExcel.importados,
                    duplicados: resultadoExcel.duplicados,
                  })} · {resultadoExcel.archivos} archivo(s) procesado(s)
                </p>
              ) : null}
            </section>

            <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
              <h2 className="font-semibold">{t("serialesPrevios.importManualTitle")}</h2>
              <div className="space-y-2">
                <Label>{t("serialesPrevios.importLabel")}</Label>
                <Textarea
                  rows={6}
                  value={textoImportar}
                  placeholder={t("serialesPrevios.importPlaceholder")}
                  onChange={(event) => setTextoImportar(event.target.value)}
                  className="font-tabular"
                />
                <p className="text-xs text-muted-foreground">{t("serialesPrevios.importHint")}</p>
              </div>
              <Button
                type="button"
                loading={importandoManual}
                disabled={!textoImportar.trim() || importandoManual}
                onClick={() => void importar()}
              >
                <Upload />
                {t("serialesPrevios.importar")}
              </Button>
              {resultadoImport ? (
                <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
                  {t("serialesPrevios.imported", { count: resultadoImport.importados })}
                  {resultadoImport.duplicados > 0
                    ? ` · ${t("serialesPrevios.duplicados", { count: resultadoImport.duplicados })}`
                    : ""}
                </p>
              ) : null}
            </section>
          </div>
        ) : (
          <EmptyState title={t("serialesPrevios.importOnlyAdmin")} />
        )
      ) : null}

      {tab === "lista" ? (
        <div className="space-y-3">
          <SearchField
            value={busquedaLista}
            onChange={setBusquedaLista}
            placeholder={t("serialesPrevios.buscarLista")}
            className="sm:max-w-sm"
          />
          <p className="text-xs text-muted-foreground">
            {t("serialesPrevios.total", { count: lista.length })}
          </p>
          {lista.length === 0 ? (
            <EmptyState icon={Archive} title={t("serialesPrevios.empty")} description={t("serialesPrevios.emptyDescription")} />
          ) : (
            <div className="space-y-3">
              <ul className="divide-y rounded-lg border bg-card">
              {listaPagina.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="font-tabular truncate text-sm">{item.serial}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.referencia ? `Ref: ${item.referencia}` : "Sin referencia"}
                      {item.cliente ? ` · Cliente: ${item.cliente}` : ""}
                      {item.fechaVenta ? ` · Venta: ${item.fechaVenta}` : ""}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      Importado: {formatDate(item.createdAt)}
                      {item.archivoOrigen ? ` · ${item.archivoOrigen}` : ""}
                      {item.notas ? ` · ${item.notas}` : ""}
                    </p>
                  </div>
                  {isAdmin ? (
                    <ConfirmDialog
                      trigger={
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive">
                          <Trash2 />
                        </Button>
                      }
                      title={t("serialesPrevios.removeTitle")}
                      description={t("serialesPrevios.removeDescription")}
                      confirmLabel={t("common.delete")}
                      destructive
                      onConfirm={() =>
                        void runAction(
                          (db2, actor) => eliminarSerialPrevio(db2, actor, { id: item.id }),
                          { success: "serialesPrevios.removed" },
                        )
                      }
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            {lista.length > tamanoPagina ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {t("serialesPrevios.mostrando", {
                    desde: (paginaLista * tamanoPagina + 1).toLocaleString("es-CO"),
                    hasta: Math.min((paginaLista + 1) * tamanoPagina, lista.length).toLocaleString("es-CO"),
                    total: lista.length.toLocaleString("es-CO"),
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={paginaLista === 0}
                    onClick={() => setPaginaLista((pagina) => Math.max(0, pagina - 1))}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    {t("serialesPrevios.anterior")}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {t("serialesPrevios.pagina", { actual: paginaLista + 1, total: totalPaginas })}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={paginaLista + 1 >= totalPaginas}
                    onClick={() => setPaginaLista((pagina) => Math.min(totalPaginas - 1, pagina + 1))}
                  >
                    {t("serialesPrevios.siguiente")}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default SerialesPrevios;
