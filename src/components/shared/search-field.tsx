import { startTransition, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { SEARCH_INPUT_PROPS } from "@/lib/search-input";
import { cn } from "@/lib/utils";

/** Campo de búsqueda con icono y botón para limpiar. */
export const SearchField = ({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) => {
  const { t } = useTranslation();

  // Lo que se ve en el campo vive aquí, aparte de la lista: así al escribir en el celular el
  // teclado nunca espera a que se vuelva a filtrar toda la tabla (eso hacía que las letras
  // saltaran o se cambiaran solas). La lista se actualiza en segundo plano.
  const [texto, setTexto] = useState(value);
  // Textos ya enviados a la lista que todavía no vuelven como `value`.
  const enviados = useRef<string[]>([]);

  useEffect(() => {
    const indice = enviados.current.indexOf(value);
    if (indice >= 0) {
      enviados.current.splice(0, indice + 1);
      return;
    }
    // Cambio que vino de fuera (limpiar filtros, volver a la lista): se refleja en el campo.
    enviados.current = [];
    setTexto(value);
  }, [value]);

  const cambiar = (nuevo: string) => {
    setTexto(nuevo);
    enviados.current.push(nuevo);
    startTransition(() => onChange(nuevo));
  };

  return (
    // h-10 = misma altura que el Input: si la celda de la cuadrícula se estira (por un vecino más
    // alto), el icono no se desplaza fuera del campo.
    <div className={cn("relative h-10", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        {...SEARCH_INPUT_PROPS}
        value={texto}
        onChange={(event) => cambiar(event.target.value)}
        placeholder={placeholder ?? t("common.search")}
        className="pl-9 pr-9"
      />
      {texto ? (
        <button
          type="button"
          onClick={() => cambiar("")}
          aria-label={t("common.clear")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
};
