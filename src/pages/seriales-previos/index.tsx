import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Archive, CheckCircle2, FileSpreadsheet, Trash2, Upload, XCircle } from "lucide-react";
import * as XLSX from "xlsx-js-style";

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
import { eliminarSerialPrevio, importarSerialesPrevios } from "@/lib/actions/seriales-previos";
import { formatDate } from "@/lib/format";
import { buscarSerialPrevio, listarSerialesPrevios } from "@/lib/selectors";

type Tab = "buscar" | "importar" | "lista";

/** Registro de ventas anteriores a la plataforma (seriales previos). */
const SerialesPrevios = ({ embedded = false }: { embedded?: boolean }) => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const { isAdmin } = usePermissions();

  const [tab, setTab] = useState<Tab>("buscar");
  const [buscado, setBuscado] = useState<string | null>(null);
  const [textoImportar, setTextoImportar] = useState("");
  const [resultadoImport, setResultadoImport] = useState<{ importados: number; duplicados: number } | null>(null);
  const [filasExcel, setFilasExcel] = useState<string[][]>([]);
  const [columnaExcel, setColumnaExcel] = useState(0);
  const [encabezadoExcel, setEncabezadoExcel] = useState(false);
  const [archivoExcel, setArchivoExcel] = useState("");
  const [errorExcel, setErrorExcel] = useState("");
  const inputExcelRef = useRef<HTMLInputElement>(null);
  const [busquedaLista, setBusquedaLista] = useState("");

  const MAX_SERIALS_EXCEL = 20_000;
  const BATCH_SIZE = 500;
  const normalizarClave = (serial: string) => serial.trim().toLocaleLowerCase();
  const serialesExcel = useMemo(() => {
    const filas = encabezadoExcel ? filasExcel.slice(1) : filasExcel;
    const vistos = new Set<string>();
    return filas
      .map((fila) => String(fila[columnaExcel] ?? "").trim())
      .filter(Boolean)
      .filter((serial) => {
        const clave = normalizarClave(serial);
        if (vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
      });
  }, [filasExcel, columnaExcel, encabezadoExcel]);
  const cantidadEnColumna = useMemo(() => {
    const filas = encabezadoExcel ? filasExcel.slice(1) : filasExcel;
    return filas.filter((fila) => String(fila[columnaExcel] ?? "").trim()).length;
  }, [filasExcel, columnaExcel, encabezadoExcel]);

  const duplicadosEnArchivo = useMemo(() => {
    const filas = encabezadoExcel ? filasExcel.slice(1) : filasExcel;
    let duplicados = 0;
    const vistos = new Set<string>();
    filas.forEach((fila) => {
      const serial = String(fila[columnaExcel] ?? "").trim();
      if (!serial) return;
      const clave = normalizarClave(serial);
      if (vistos.has(clave)) duplicados += 1;
      else vistos.add(clave);
    });
    return duplicados;
  }, [filasExcel, columnaExcel, encabezadoExcel]);

  const leerExcel = async (file: File) => {
    setErrorExcel("");
    setResultadoImport(null);
    setArchivoExcel(file.name);
    setFilasExcel([]);
    try {
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("El archivo no contiene hojas para leer.");
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      });
      const rows = rawRows.map((row) => row.map((cell) => String(cell ?? "").trim()));
      if (rows.length === 0) throw new Error("La primera hoja está vacía.");
      const encabezados = rows[0].map((cell) => cell.toLocaleLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, ""));
      const indexEncabezado = encabezados.findIndex((cell) =>
        /^(serial(es)?|imei|imeis|sn|s\\/n|serial number|device serial)$/.test(cell) ||
        /serial|imei|numero de serie/.test(cell),
      );
      const tieneEncabezado = indexEncabezado >= 0;
      const index = tieneEncabezado ? indexEncabezado : 0;
      const total = rows.slice(tieneEncabezado ? 1 : 0)
        .filter((row) => String(row[index] ?? "").trim()).length;
      if (total > MAX_SERIALS_EXCEL) {
        throw new Error(`El archivo contiene ${total.toLocaleString("es-CO")} seriales en esa columna. El máximo permitido es 20.000.`);
      }
      setFilasExcel(rows);
      setColumnaExcel(index);
      setEncabezadoExcel(tieneEncabezado);
    } catch (error) {
      setErrorExcel(error instanceof Error ? error.message : "No se pudo leer el archivo.");
      setArchivoExcel("");
      setFilasExcel([]);
    }
  };

  const importarEnLotes = async (seriales: string[], duplicadosIniciales = 0) => {
    let importados = 0;
    let duplicados = duplicadosIniciales;
    for (let offset = 0; offset < seriales.length; offset += BATCH_SIZE) {
      const lote = seriales.slice(offset, offset + BATCH_SIZE);
      const result = await runAction(
        (db2, actor) => importarSerialesPrevios(db2, actor, { seriales: lote }),
        { key: `seriales-previos-excel-${offset}` },
      );
      if (!result) {
        setResultadoImport({ importados, duplicados });
        return false;
      }
      importados += result.importados;
      duplicados += result.duplicados;
    }
    setResultadoImport({ importados, duplicados });
    setTextoImportar("");
    setFilasExcel([]);
    setArchivoExcel("");
    if (inputExcelRef.current) inputExcelRef.current.value = "";
    return true;
  };

  const encontrado = useMemo(
    () => (buscado ? buscarSerialPrevio(db, buscado) : undefined),
    [db, buscado],
  );

  const lista = useMemo(() => listarSerialesPrevios(db, busquedaLista), [db, busquedaLista]);

  const importar = async () => {
    const seriales = textoImportar.split(/[\\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (seriales.length === 0) return;
    if (seriales.length > MAX_SERIALS_EXCEL) {
      setErrorExcel("El máximo permitido es 20.000 seriales por importación.");
      return;
    }
    await importarEnLotes(seriales);
  };

  const importarExcel = async () => {
    if (serialesExcel.length === 0 || cantidadEnColumna > MAX_SERIALS_EXCEL) return;
    setErrorExcel("");
    await importarEnLotes(serialesExcel, duplicadosEnArchivo);
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
          <section className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
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
            <div className="space-y-3 rounded-lg border border-dashed p-4">
              <div className="flex items-start gap-3">
                <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium">Importar desde Excel</p>
                  <p className="text-xs text-muted-foreground">
                    Sube un archivo .xlsx, .xls o .csv con hasta 20.000 seriales. Se revisa la primera hoja y se omiten los repetidos en el archivo o en Nexora.
                  </p>
                </div>
              </div>
              <input
                ref={inputExcelRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium"
                disabled={runAction.pending}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void leerExcel(file);
                }}
              />
              {archivoExcel ? <p className="truncate text-xs text-muted-foreground">Archivo: {archivoExcel}</p> : null}
              {filasExcel.length > 0 ? (
                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={encabezadoExcel}
                      onChange={(event) => setEncabezadoExcel(event.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                    La primera fila contiene encabezados y no debe importarse
                  </label>
                  <div className="space-y-1">
                    <Label htmlFor="seriales-excel-column">Columna que contiene los seriales</Label>
                    <select
                      id="seriales-excel-column"
                      value={columnaExcel}
                      onChange={(event) => setColumnaExcel(Number(event.target.value))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {Array.from({ length: Math.max(...filasExcel.map((row) => row.length)) }, (_, index) => (
                        <option key={index} value={index}>
                          Columna {String.fromCharCode(65 + (index % 26))}{index >= 26 ? Math.floor(index / 26) : ""}
                          {encabezadoExcel && filasExcel[0]?.[index] ? ` · ${filasExcel[0][index]}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  {cantidadEnColumna > MAX_SERIALS_EXCEL ? (
                    <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                      La columna seleccionada contiene {cantidadEnColumna.toLocaleString("es-CO")} filas con seriales. El máximo por archivo es 20.000.
                    </p>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Seriales únicos para importar</p>
                      <p className="text-lg font-semibold tabular-nums">{serialesExcel.length.toLocaleString("es-CO")}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Repetidos dentro del archivo</p>
                      <p className="text-lg font-semibold tabular-nums">{duplicadosEnArchivo.toLocaleString("es-CO")}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Límite por archivo</p>
                      <p className="text-lg font-semibold tabular-nums">20.000</p>
                    </div>
                  </div>
                  {serialesExcel.length > 0 ? (
                    <div className="rounded-md border p-3">
                      <p className="mb-2 text-xs font-medium">Vista previa de los primeros seriales</p>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {serialesExcel.slice(0, 5).map((serial, index) => <li key={index} className="truncate font-mono">{serial}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    loading={runAction.pending}
                    disabled={!serialesExcel.length || cantidadEnColumna > MAX_SERIALS_EXCEL}
                    onClick={() => void importarExcel()}
                  >
                    <Upload />
                    Importar {serialesExcel.length.toLocaleString("es-CO")} seriales
                  </Button>
                </div>
              ) : null}
              {errorExcel ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{errorExcel}</p> : null}
            </div>
            <Button
              type="button"
              loading={runAction.pending}
              disabled={!textoImportar.trim()}
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
            <ul className="divide-y rounded-lg border bg-card">
              {lista.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="font-tabular truncate text-sm">{item.serial}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(item.createdAt)}
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
          )}
        </div>
      ) : null}
    </div>
  );
};

export default SerialesPrevios;
