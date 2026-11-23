import { ClienteTecnologiaSelect } from "@/components/shared/cliente-tecnologia-select";
import { OptionSelect } from "@/components/shared/option-select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface FormularioSinSerial {
  cliente: string;
  referencia: string;
  motivo: string;
}

/** Mismos datos para uno por uno y por lote; el código temporal nunca se confunde con el IMEI. */
export const CamposSinSerial = ({
  value, onChange, clientes, referencias, sufijo,
}: {
  value: FormularioSinSerial;
  onChange: (next: FormularioSinSerial) => void;
  clientes: string[];
  referencias: string[];
  sufijo: string;
}) => (
  <div className="grid gap-3 sm:grid-cols-2">
    <div className="space-y-2">
      <Label>Cliente del equipo</Label>
      <ClienteTecnologiaSelect
        value={value.cliente}
        clientes={clientes}
        onChange={(cliente) => onChange({ ...value, cliente })}
      />
    </div>
    <div className="space-y-2">
      <Label>Referencia / modelo</Label>
      <OptionSelect
        value={value.referencia || undefined}
        onChange={(referencia) => onChange({ ...value, referencia })}
        options={referencias.map((referencia) => ({ value: referencia, label: referencia }))}
        placeholder="Selecciona el modelo del celular"
        emptyLabel="Selecciona un modelo"
      />
    </div>
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor={"motivo-sin-serial-" + sufijo}>Observaciones del equipo</Label>
      <Textarea
        id={"motivo-sin-serial-" + sufijo}
        rows={2}
        value={value.motivo}
        placeholder="Falla reportada y estado en que llegó el teléfono"
        onChange={(event) => onChange({ ...value, motivo: event.target.value })}
      />
    </div>
  </div>
);
