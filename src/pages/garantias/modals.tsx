import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2, Wrench } from "lucide-react";

import { OptionSelect } from "@/components/shared/option-select";
import { ActiveBadge } from "@/components/shared/status-badge";
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
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/use-permissions";
import { useRunAction } from "@/hooks/use-run-action";
import { useStore } from "@/hooks/use-store";
import {
  actualizarClienteGarantia,
  createTecnico,
  deleteTecnico,
  devolverGarantia,
  entregarGarantia,
  garantiaTieneCliente,
  registrarDiagnostico,
  updateTecnico,
} from "@/lib/actions/warranties";
import type { Warranty, WarrantyResolution } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ReplacementSerialField } from "./replacement-serial-field";

/** Registra el diagnóstico del taller con resolución y costo. */
export const DiagnosticoDialog = ({
  warranty,
  trigger,
}: {
  warranty: Warranty;
  trigger: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const runAction = useRunAction();
  const [open, setOpen] = useState(false);
  const [diagnostico, setDiagnostico] = useState("");
  const [resolucion, setResolucion] = useState<WarrantyResolution | "">("");
  const [costo, setCosto] = useState("");
  const [replacementUnitId, setReplacementUnitId] = useState("");

  const esCambio = resolucion === "cambio";

  const save = async () => {
    if (!resolucion) return;
    const result = await runAction(
      (db, actor) =>
        registrarDiagnostico(db, actor, {
          warrantyId: warranty.id,
          diagnostico,
          resolucion,
          costo: costo ? Number(costo) : undefined,
          replacementUnitId: esCambio ? replacementUnitId : undefined,
        }),
      { success: "warranty.diagnosed" },
    );
    if (result) {
      setOpen(false);
      setDiagnostico("");
      setResolucion("");
      setCosto("");
      setReplacementUnitId("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("warranty.diagnoseTitle")}</DialogTitle>
          <DialogDescription>{warranty.code}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="diagText">{t("warranty.diagnosis")}</Label>
            <Textarea
              id="diagText"
              rows={2}
              value={diagnostico}
              placeholder={t("warranty.diagnosisPlaceholder")}
              onChange={(event) => setDiagnostico(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("warranty.resolution")}</Label>
            <OptionSelect
              value={resolucion || undefined}
              onChange={(value) => setResolucion(value as WarrantyResolution)}
              options={(
                [
                  "reparado",
                  "cambio",
                  "sin_falla",
                ] as WarrantyResolution[]
              ).map((value) => ({
                value,
                label: t(`warrantyResolution.${value}`),
              }))}
              placeholder={t("warranty.selectResolution")}
            />
          </div>
          {esCambio ? (
            <div className="space-y-2">
              <Label>{t("warranty.replacementUnit")}</Label>
              <p className="text-xs text-muted-foreground">El serial debe pertenecer a una unidad disponible de la misma referencia.</p>
              <ReplacementSerialField
                warranty={warranty}
                value={replacementUnitId}
                onChange={setReplacementUnitId}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="diagCosto">{t("warranty.cost")}</Label>
            <Input
              id="diagCosto"
              type="number"
              min={0}
              step="0.01"
              value={costo}
              onChange={(event) => setCosto(event.target.value)}
              placeholder="0"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            loading={runAction.pending}
            disabled={!diagnostico.trim() || !resolucion || (esCambio && !replacementUnitId)}
            onClick={() => void save()}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Entrega la garantía al cliente; con "cambio" exige elegir el reemplazo. */
export const EntregarDialog = ({
  warranty,
  trigger,
}: {
  warranty: Warranty;
  trigger: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const [open, setOpen] = useState(false);
  // Si el diagnóstico ya guardó el serial del reemplazo, se usa ese; solo se elige aquí en
  // casos anteriores a ese cambio.
  const [replacementUnitId, setReplacementUnitId] = useState(warranty.replacementUnitId ?? "");
  const [devolverABodega, setDevolverABodega] = useState(false);
  const [reembolso, setReembolso] = useState(false);
  const [destinoDefectuoso, setDestinoDefectuoso] = useState<"cambio" | "reembolso" | "bodega">("cambio");

  const defectuoso = warranty.resolucion === "defectuoso";
  const conCliente = garantiaTieneCliente(warranty);
  const needsReplacement = warranty.resolucion === "cambio" || (defectuoso && conCliente && destinoDefectuoso === "cambio");
  // Al reparar o no encontrar falla, el equipo puede volver al cliente o quedar disponible en
  // bodega. También se permite hacerlo con una garantía previa, registrando el serial manual.
  const puedeElegirBodega =
    (warranty.resolucion === "reparado" || warranty.resolucion === "sin_falla") &&
    garantiaTieneCliente(warranty);
  const serialOriginal = warranty.unitId
    ? db.units.find((item) => item.id === warranty.unitId)?.serial
    : warranty.imeiManual;
  const serialReemplazo = replacementUnitId
    ? db.units.find((item) => item.id === replacementUnitId)?.serial
    : undefined;
  // Las fallas de inventario no tienen cliente: al terminar el servicio regresan a bodega.
  const sinClienteReparado =
    (warranty.resolucion === "reparado" || warranty.resolucion === "sin_falla") &&
    !garantiaTieneCliente(warranty);
  const reembolsoElegido = conCliente && (defectuoso ? destinoDefectuoso === "reembolso" : reembolso);
  const aBodega = reembolsoElegido || devolverABodega || sinClienteReparado || (defectuoso && (!conCliente || destinoDefectuoso !== "cambio"));

  const save = async () => {
    const result = await runAction(
      (db2, actor) =>
        entregarGarantia(db2, actor, {
          warrantyId: warranty.id,
          replacementUnitId: needsReplacement ? replacementUnitId : undefined,
          devolverABodega: puedeElegirBodega ? devolverABodega : undefined,
          reembolso: reembolsoElegido,
          destinoDefectuoso: defectuoso ? (conCliente ? destinoDefectuoso : "bodega") : undefined,
        }),
      { success: aBodega ? "warranty.returnedToStock" : "warranty.delivered" },
    );
    if (result) {
      setOpen(false);
      setReplacementUnitId(warranty.replacementUnitId ?? "");
      setDevolverABodega(false);
      setReembolso(false);
      setDestinoDefectuoso("cambio");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {sinClienteReparado ? t("warranty.resolveTitle") : t("warranty.deliverTitle")}
          </DialogTitle>
          <DialogDescription>
            {defectuoso
              ? "Diagnóstico sin solución: elige si entregas un reemplazo al cliente o conservas el equipo en bodega con reembolso."
              : needsReplacement
              ? t("warranty.deliverReplacementHint")
              : sinClienteReparado
                ? t("warranty.resolveHint")
                : t("warranty.deliverHint")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {defectuoso ? (
            <div className="space-y-2">
              <Label>Destino del equipo defectuoso</Label>
              {conCliente ? (
                <div className="grid gap-2">
                  <button type="button" className={cn("rounded-md border px-3 py-2 text-left text-sm", destinoDefectuoso === "cambio" && "border-primary bg-primary/10")} onClick={() => setDestinoDefectuoso("cambio")}>
                    <strong>Entregar reemplazo al cliente</strong><span className="block text-muted-foreground">Solicitar serial nuevo; el anterior queda defectuoso en bodega.</span>
                  </button>
                  <button type="button" className={cn("rounded-md border px-3 py-2 text-left text-sm", destinoDefectuoso === "reembolso" && "border-primary bg-primary/10")} onClick={() => setDestinoDefectuoso("reembolso")}>
                    <strong>Reembolso al cliente</strong><span className="block text-muted-foreground">Equipo defectuoso queda en bodega. El dinero se registra por separado.</span>
                  </button>
                </div>
              ) : <p className="rounded-md bg-muted/50 p-3 text-sm">Falla de inventario: queda defectuoso en bodega; no se entrega a un cliente.</p>}
            </div>
          ) : null}
          {conCliente && !defectuoso && warranty.resolucion !== "cambio" ? (
            <div className="space-y-2 rounded-md border p-3">
              <Label>Decisión comercial</Label>
              <div className="grid gap-2">
                <button type="button" className={cn("rounded-md border px-3 py-2 text-left text-sm", !reembolso && "border-primary bg-primary/10")} onClick={() => setReembolso(false)}>
                  <strong>Continuar sin reembolso</strong>
                  <span className="block text-muted-foreground">Resolver según el diagnóstico registrado.</span>
                </button>
                <button type="button" className={cn("rounded-md border px-3 py-2 text-left text-sm", reembolso && "border-primary bg-primary/10")} onClick={() => { setReembolso(true); setDevolverABodega(false); }}>
                  <strong>Acordar reembolso al cliente</strong>
                  <span className="block text-muted-foreground">No clasifica el celular como defectuoso. El dinero se registra por separado.</span>
                </button>
              </div>
            </div>
          ) : null}
          {needsReplacement ? (
            <div className="space-y-2">
              <Label>{t("warranty.replacementUnit")}</Label>
              <p className="text-xs text-muted-foreground">El serial se seleccionó en Servicio. Si ya no está disponible, puedes cambiarlo por otro de la misma referencia.</p>
              <ReplacementSerialField
                warranty={warranty}
                value={replacementUnitId}
                onChange={setReplacementUnitId}
              />
            </div>
          ) : null}
          {puedeElegirBodega && !reembolso ? (
            <div className="flex gap-1 rounded-md border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setDevolverABodega(false)}
                className={cn(
                  "flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                  !devolverABodega ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {t("warranty.deliverToCustomer")}
              </button>
              <button
                type="button"
                onClick={() => setDevolverABodega(true)}
                className={cn(
                  "flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                  devolverABodega ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {t("warranty.returnToStock")}
              </button>
            </div>
          ) : null}
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            {warranty.resolucion === "cambio" && !defectuoso
              ? `Serial original ${serialOriginal ?? "—"}: disponible en bodega. Serial de reemplazo ${serialReemplazo ?? "—"}: entregado al cliente.`
              : reembolsoElegido && !defectuoso
                ? `Reembolso acordado. Serial original ${serialOriginal ?? "—"}: disponible en bodega. El movimiento de dinero se registra por separado.`
                : defectuoso
                  ? (destinoDefectuoso === "cambio" && conCliente ? "Registro histórico: el reemplazo sale del inventario y el original queda marcado como defectuoso." : "Registro histórico: el equipo queda defectuoso en bodega; el reembolso se registra por separado.")
                  : aBodega
                    ? t("warranty.deliverEffect.bodega")
                    : t(`warranty.deliverEffect.${warranty.resolucion ?? "reparado"}`)}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            loading={runAction.pending}
            disabled={needsReplacement && !replacementUnitId}
            onClick={() => void save()}
          >
            {reembolsoElegido && !defectuoso ? "Confirmar reembolso" : defectuoso ? (conCliente && destinoDefectuoso === "cambio" ? "Confirmar cambio" : conCliente ? "Confirmar reembolso" : "Confirmar defectuoso en bodega") : devolverABodega
              ? t("warranty.returnToStock")
              : sinClienteReparado
                ? t("warranty.resolveToStock")
                : t("warranty.deliver")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Devuelve el equipo sin resolver (caso cerrado como devuelto). */
export const DevolverDialog = ({
  warranty,
  trigger,
}: {
  warranty: Warranty;
  trigger: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const runAction = useRunAction();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  const save = async () => {
    const result = await runAction(
      (db, actor) => devolverGarantia(db, actor, { warrantyId: warranty.id, motivo }),
      { success: "warranty.returned" },
    );
    if (result) {
      setOpen(false);
      setMotivo("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("warranty.returnTitle")}</DialogTitle>
          <DialogDescription>{t("warranty.returnHint")}</DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Textarea
            rows={3}
            value={motivo}
            placeholder={t("warranty.returnPlaceholder")}
            onChange={(event) => setMotivo(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" loading={runAction.pending} onClick={() => void save()}>
            {t("warranty.returnConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Técnicos externos. Con `onSelect` sirve para elegir a quién enviar los casos
 * (y se cierra al elegir); sin él es solo la administración de la lista. Alta,
 * activación y baja las exige la acción con permiso de administrador, así que
 * los controles solo se ofrecen a administradores.
 */
export const TecnicosDialog = ({
  trigger,
  onSelect,
}: {
  trigger: React.ReactNode;
  onSelect?: (tecnicoId: string) => void;
}) => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const { isAdmin } = usePermissions();
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [seleccion, setSeleccion] = useState("");

  const save = async () => {
    const result = await runAction((db2, actor) => createTecnico(db2, actor, { nombre }), {
      key: "tecnico-crear",
    });
    if (result) setNombre("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("warranty.tecnicoManage")}</DialogTitle>
          <DialogDescription>{t("warranty.tecnicoManageHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <ul className="divide-y rounded-md border">
            {db.tecnicos.map((tecnico) => (
              <li key={tecnico.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{tecnico.nombre}</span>
                  <ActiveBadge isActive={tecnico.activo} />
                </div>
                {isAdmin ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void runAction((db2, actor) =>
                          updateTecnico(db2, actor, { id: tecnico.id, activo: !tecnico.activo }),
                        )
                      }
                    >
                      {tecnico.activo ? t("common.deactivate") : t("common.activate")}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => void runAction((db2, actor) => deleteTecnico(db2, actor, { id: tecnico.id }))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          {isAdmin ? (
            <div className="flex gap-2">
              <Input
                value={nombre}
                placeholder={t("warranty.tecnicoNew")}
                onChange={(event) => setNombre(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (!event.repeat) void save();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                loading={runAction.pending}
                onClick={() => void save()}
              >
                <Plus />
              </Button>
            </div>
          ) : null}

          {onSelect && db.tecnicos.length > 0 ? (
            <div className="space-y-2">
              <Label>{t("warranty.tecnicoSelect")}</Label>
              <OptionSelect
                value={seleccion}
                onChange={(value) => {
                  if (!value) return;
                  onSelect(value);
                  setSeleccion("");
                  setOpen(false);
                }}
                options={db.tecnicos
                  .filter((tecnico) => tecnico.activo)
                  .map((tecnico) => ({ value: tecnico.id, label: tecnico.nombre }))}
                placeholder={t("warranty.tecnicoSelect")}
              />
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** Corrige el cliente del caso: elige uno registrado o lo escribe manualmente. */
export const EditarClienteDialog = ({
  warranty,
  trigger,
}: {
  warranty: Warranty;
  trigger: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const { db } = useStore();
  const runAction = useRunAction();
  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"registrado" | "manual">(
    warranty.customerId ? "registrado" : "manual",
  );
  const [customerId, setCustomerId] = useState(warranty.customerId ?? "");
  const [clienteManual, setClienteManual] = useState(warranty.clienteManual ?? "");

  const opcionesClientes = useMemo(
    () =>
      [...db.customers]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => ({ value: item.id, label: item.name })),
    [db.customers],
  );

  const reset = () => {
    setModo(warranty.customerId ? "registrado" : "manual");
    setCustomerId(warranty.customerId ?? "");
    setClienteManual(warranty.clienteManual ?? "");
  };

  const puedeGuardar =
    modo === "registrado" ? Boolean(customerId) : clienteManual.trim().length > 0;

  const save = async () => {
    if (!puedeGuardar) return;
    const result = await runAction(
      (db2, actor) =>
        actualizarClienteGarantia(db2, actor, {
          warrantyId: warranty.id,
          customerId: modo === "registrado" ? customerId : undefined,
          clienteManual: modo === "manual" ? clienteManual : undefined,
        }),
      { success: "warranty.clienteActualizado" },
    );
    if (result) setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("warranty.editarClienteTitle")}</DialogTitle>
          <DialogDescription>{t("warranty.editarClienteHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={modo === "registrado" ? "default" : "outline"}
              onClick={() => setModo("registrado")}
            >
              {t("warranty.clienteRegistrado")}
            </Button>
            <Button
              type="button"
              variant={modo === "manual" ? "default" : "outline"}
              onClick={() => setModo("manual")}
            >
              {t("warranty.clienteManualOpcion")}
            </Button>
          </div>

          {modo === "registrado" ? (
            <div className="space-y-2">
              <Label>{t("customer.title")}</Label>
              <OptionSelect
                value={customerId}
                onChange={setCustomerId}
                options={opcionesClientes}
                placeholder={t("common.select")}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>{t("warranty.clienteManualLabel")}</Label>
              <Input
                value={clienteManual}
                onChange={(event) => setClienteManual(event.target.value)}
                placeholder={t("warranty.clienteManualPlaceholder")}
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (!event.repeat) void save();
                  }
                }}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button loading={runAction.pending} disabled={!puedeGuardar} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
