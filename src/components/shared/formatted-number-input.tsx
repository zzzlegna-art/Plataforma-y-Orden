import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import {
  countGroupedNumberCharacters,
  formatGroupedNumber,
  getGroupedNumberCaret,
  parseGroupedNumber,
} from "@/lib/number-input";

type FormattedNumberInputProps = Omit<
  ComponentProps<typeof Input>,
  "type" | "value" | "onChange" | "defaultValue"
> & {
  value: string;
  onValueChange: (value: string) => void;
  allowDecimal?: boolean;
};

/**
 * Campo numérico que muestra puntos de miles y coma decimal, manteniendo un valor
 * canónico sin separadores para que Number() y el guardado sigan funcionando igual.
 */
export const FormattedNumberInput = ({
  value,
  onValueChange,
  allowDecimal = true,
  ...props
}: FormattedNumberInputProps) => {
  const [displayValue, setDisplayValue] = useState(() => formatGroupedNumber(value, allowDecimal));
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretRef = useRef<number | null>(null);

  useEffect(() => {
    setDisplayValue(formatGroupedNumber(value, allowDecimal));
  }, [value, allowDecimal]);

  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null || !inputRef.current) return;
    inputRef.current.setSelectionRange(caret, caret);
    pendingCaretRef.current = null;
  });

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.currentTarget.value;
    const caret = event.currentTarget.selectionStart ?? rawValue.length;
    const meaningfulCharactersBeforeCaret = countGroupedNumberCharacters(
      rawValue.slice(0, caret),
      allowDecimal,
    );
    const nextValue = parseGroupedNumber(rawValue, allowDecimal);
    const nextDisplayValue = formatGroupedNumber(nextValue, allowDecimal);

    pendingCaretRef.current = getGroupedNumberCaret(
      nextDisplayValue,
      meaningfulCharactersBeforeCaret,
      allowDecimal,
    );
    setDisplayValue(nextDisplayValue);
    onValueChange(nextValue);
  };

  return (
    <Input
      {...props}
      ref={inputRef}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      value={displayValue}
      onChange={handleChange}
    />
  );
};
