import { useRef, useState } from "react";
import { BadgeCheck, ScanLine, LockKeyhole, ShieldCheck, Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NexoraSite } from "@/lib/nexora-sites";
import {
  POS_REASON_LABEL, runPosPreflight, validatePosPreflight, type PosPreflight,
} from "@/lib/nexora-pos-preflight";

export const PosPreflightPanel = ({ sites }: { sites: readonly NexoraSite[] }) => {
  const [siteId, setSiteId] = useState("");
  const [imei, setImei] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [result, setResult] = useState<PosPreflight | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const activeStores = sites.filter((s) => s.siteType === "local" && s.isActive);
  const effectiveSite = activeStores.find((s) => s.id === siteId)?.id
    ?? activeStores[0]?.id ?? "";
  const amount = Number(priceInput);
  const invalid = validatePosPreflight(effectiveSite, imei, amount);

  const evaluate = async () => {
    if (invalid || busy) return;
    const call = ++request.current;
    setBusy(true);
    setResult(null);
    try {
      const response = await runPosPreflight(effectiveSite,imei,amount);
      if (call === request.current) setResult(response);
    } catch (error) {
      if (call === request.current)
        toast.error(error instanceof Error ? error.message : "No pudo verificarse el IMEI.");
    } finally {
      if (call === request.current) setBusy(false);
    }
  };
  const reset = () => { request.current++; setResult(null); };
  const money = (n: number) => new Intl.NumberFormat("es-CO", {
    style: "currency",currency:"COP",maximumFractionDigits:0,
  }).format(n);
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm" aria-label="Comprobación previa del POS">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-3 text-primary"><ShoppingBag className="h-5 w-5" /></span>
          <div className="max-w-xl">
            <h2 className="text-lg font-bold">Punto de venta · comprobación previa</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Verifica un IMEI individual, su sede, sus compromisos y su costo real
              antes de activar las ventas minoristas.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
          <LockKeyhole className="h-3.5 w-3.5" /> Venta inactiva
        </span>
      </div>
      <div className="space-y-4 p-5 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(150px,1fr)_minmax(200px,1.2fr)_minmax(140px,0.7fr)_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="nexora-pos-site">Local comercial</Label>
            <select id="nexora-pos-site" className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={effectiveSite} disabled={busy || activeStores.length === 0}
              onChange={(e) => { setSiteId(e.target.value); reset(); }}>
              {activeStores.length === 0 ? <option value="">Sin locales registrados</option> : null}
              {activeStores.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nexora-pos-imei">IMEI / Serial</Label>
            <Input id="nexora-pos-imei" value={imei} maxLength={160} autoComplete="off" disabled={busy}
              placeholder="Escanear IMEI"
              onChange={(e) => { setImei(e.target.value); reset(); }} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nexora-pos-price">Precio propuesto (COP)</Label>
            <Input id="nexora-pos-price" type="number" min={1} step={1} value={priceInput}
              disabled={busy} placeholder="0"
              onChange={(e) => { setPriceInput(e.target.value); reset(); }} />
          </div>
          <Button disabled={busy || !priceInput || Boolean(invalid)} onClick={() => void evaluate()}>
            <Search className="h-4 w-4" /> Verificar
          </Button>
        </div>
        {activeStores.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ScanLine className="h-4 w-4" /> Registra un local comercial antes de verificar ventas.
          </p>
        ) : null}
        {result ? (
          <div role="status" className="rounded-xl border bg-muted/15 p-4">
            <div className="flex items-start gap-3">
              {result.eligibleForFuturePos ? (
                <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-600" />
              ) : <LockKeyhole className="h-5 w-5 shrink-0 text-amber-600" />}
              <div className="min-w-0">
                <p className="font-semibold">
                  {POS_REASON_LABEL[result.reason] ?? "El servidor impidió la operación."}
                </p>
                <p className="mt-1 break-all font-mono text-sm text-muted-foreground">{result.serial}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Costo por IMEI: <strong className="text-foreground">
                    {result.unitCost === null ? "Sin validar" : money(result.unitCost)}
                  </strong> · Precio evaluado: <strong className="text-foreground">
                    {money(result.proposedPrice)}
                  </strong>
                </p>
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Ninguna verificación genera venta, reserva, factura o cambio de inventario.
          Las ventas se habilitarán únicamente mediante una operación transaccional de POS,
          con apertura de caja, pago completo, rol y sede autorizados.
        </div>
      </div>
    </section>
  );
};
