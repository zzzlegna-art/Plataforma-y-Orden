import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Límite de interfaz; technical_specs en la base se guarda como JSONB. */
export const PRODUCT_TECHNICAL_TEXT_LIMIT = 1000;
export const PRODUCT_CUSTOM_SPEC_NAME_LIMIT = 160;

interface ProductSpecificationFieldProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
}

/**
 * Mantiene exactamente el texto durante la escritura, incluidos espacios
 * finales, dobles espacios y composición IME. Normalizar solo al guardar.
 */
export const ProductSpecificationField = ({
  id,
  value,
  onValueChange,
  placeholder,
  multiline = false,
  maxLength = PRODUCT_TECHNICAL_TEXT_LIMIT,
}: ProductSpecificationFieldProps) => {
  const shared = { id, value, placeholder, maxLength };
  return multiline ? (
    <Textarea
      {...shared}
      rows={2}
      className="min-h-[70px] resize-y"
      onChange={(event) => onValueChange(event.target.value)}
    />
  ) : (
    <Input
      {...shared}
      onChange={(event) => onValueChange(event.target.value)}
    />
  );
};
