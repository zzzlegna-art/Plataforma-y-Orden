import { useTranslation } from "react-i18next";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export interface SelectOption {
  value: string;
  label: string;
}

/** Select con opción vacía ("Todos"/"Sin asignar") integrada. */
export const OptionSelect = ({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  className,
  triggerClassName,
  disabled,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Texto de la opción vacía; si no se define, no se ofrece opción vacía. */
  emptyLabel?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <Select
      value={value || NONE}
      onValueChange={(next) => onChange(next === NONE ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger className={cn("w-full", triggerClassName)}>
        <SelectValue placeholder={placeholder ?? t("common.select")} />
      </SelectTrigger>
      <SelectContent className={className}>
        {emptyLabel ? <SelectItem value={NONE}>{emptyLabel}</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
