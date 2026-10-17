import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Selector de cliente con búsqueda: lista los clientes de tecnología y, si el cliente no está
 * en la lista, permite escribir el nombre a mano (las garantías previas aceptan un nombre libre).
 */
export const ClienteTecnologiaSelect = ({
  value,
  onChange,
  clientes,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Nombres de los clientes que se ofrecen como opciones. */
  clientes: string[];
  placeholder?: string;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const texto = busqueda.trim();
  const existe = clientes.some((nombre) => nombre.toLowerCase() === texto.toLowerCase());

  const elegir = (nombre: string) => {
    onChange(nombre);
    setBusqueda("");
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setBusqueda("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full justify-between rounded-lg border-border bg-background px-3 text-left font-normal shadow-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary/20"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder || t("common.select")}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg" align="start" sideOffset={6}>
        <Command className="rounded-lg">
          <CommandInput
            value={busqueda}
            onValueChange={setBusqueda}
            placeholder={t("common.search")}
            className="h-10 rounded-none border-0 bg-transparent py-2 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
          />
          <CommandList className="max-h-60 py-1">
            <CommandEmpty>{t("warranty.previaClienteSinResultados")}</CommandEmpty>
            <CommandGroup className="p-1">
              {clientes.map((nombre) => (
                <CommandItem key={nombre} value={nombre} onSelect={() => elegir(nombre)} className="min-h-9 gap-1 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-muted data-[selected=true]:text-foreground">
                  <Check className={cn("mr-2 h-4 w-4", value === nombre ? "opacity-100" : "opacity-0")} />
                  {nombre}
                </CommandItem>
              ))}
              {texto && !existe ? (
                <CommandItem
                  value={`__usar__${texto}`}
                  forceMount
                  onSelect={() => elegir(texto)}
                  className="min-h-9 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-muted data-[selected=true]:text-foreground"
                >
                  {t("warranty.previaClienteUsar", { nombre: texto })}
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
