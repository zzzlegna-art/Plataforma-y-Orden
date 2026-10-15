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
                  "defectuoso",
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

  const needsReplacement = warranty.resolucion === "cambio";
  // El cliente envió el equipo para garantía; al repararlo, el negocio elige si se lo
  // reenvía o se lo queda como inventario. Solo aplica cuando SÍ hay cliente (sin cliente ya
  // vuelve solo a bodega, no hay nada que elegir) y cuando la resolución fue "reparado" (con
  // "cambio" el original ya no vuelve al cliente de todas formas, se entrega el reemplazo).
  const puedeElegirBodega =
    warranty.resolucion === "reparado" && Boolean(warranty.customerId || warranty.orderId);
  // (Una garantía previa tiene cliente pero no unidad en el sistema: no hay nada que devolver a
  // bodega, por eso no ofrece esa opción y se entrega directamente al cliente.)
  const reemplazoGuardado = warranty.replacementUnitId
    ? db.units.find((item) => item.id === warranty.replacementUnitId)
    : undefined;
  const nombreProducto = (productId: string) =>
    db.products.find((item) => item.id === productId)?.name ?? "";
  // Falla de inventario reparada: no hay a quién entregarle nada, vuelve sola a bodega.
  const sinClienteReparado = warranty.resolucion === "reparado" && !garantiaTieneCliente(warranty);
  const aBodega = devolverABodega || sinClienteReparado;

  const save = async () => {
    const result = await runAction(
      (db2, actor) =>
        entregarGarantia(db2, actor, {
          warrantyId: warranty.id,
          replacementUnitId: needsReplacement ? replacementUnitId : undefined,
          devolverABodega: puedeElegirBodega ? devolverABodega : undefined,
        }),
      { success: aBodega ? "warranty.returnedToStock" : "warranty.delivered" },
    );
    if (result) {
      setOpen(false);
      setReplacementUnitId(warranty.replacementUnitId ?? "");
      setDevolverABodega(false);
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
            {needsReplacement
              ? t("warranty.deliverReplacementHint")
              : sinClienteReparado
                ? t("warranty.resolveHint")
                : t("warranty.deliverHint")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {needsReplacement ? (
            <div className="space-y-2">
              <Label>{t("warranty.replacementUnit")}</Label>
              {reemplazoGuardado ? (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
                  {reemplazoGuardado.serial}
                  {warranty.productId ? "" : ` · ${nombreProducto(reemplazoGuardado.productId)}`}
                </p>
              ) : (
                <ReplacementSerialField
                  warranty={warranty}
                  value={replacementUnitId}
                  onChange={setReplacementUnitId}
                />
              )}
            </div>
          ) : null}
          {puedeElegirBodega ? (
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
            {aBodega
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
            {devolverABodega
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
