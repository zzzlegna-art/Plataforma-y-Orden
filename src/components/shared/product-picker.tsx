import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";

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
import { ordenarProductos } from "@/lib/product-order";
import { SEARCH_INPUT_PROPS } from "@/lib/search-input";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Selector de producto con búsqueda por SKU o nombre (catálogos grandes). */
export const ProductPicker = ({
  products,
  value,
  onChange,
  className,
  placeholder,
}: {
  products: Product[];
  value?: string;
  onChange: (productId: string) => void;
  className?: string;
  placeholder?: string;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ordenados = useMemo(() => ordenarProductos(products), [products]);
  const selected = useMemo(
    () => products.find((product) => product.id === value),
    [products, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {selected ? `${selected.sku} · ${selected.name}` : (placeholder ?? t("product.select"))}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] overflow-hidden p-0" align="start">
        <Command className="min-w-0">
          <CommandInput
            {...SEARCH_INPUT_PROPS}
            placeholder={t("product.searchPlaceholder")}
            className="h-10 min-w-0 rounded-none border-0 px-0 shadow-none outline-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none"
          />
          <CommandList>
            <CommandEmpty>{t("common.noResults")}</CommandEmpty>
            <CommandGroup>
              {ordenados.map((product) => (
                <CommandItem
                  key={product.id}
                  value={`${product.sku} ${product.name}`}
                  onSelect={() => {
                    onChange(product.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      product.id === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm">{product.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{product.sku}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
