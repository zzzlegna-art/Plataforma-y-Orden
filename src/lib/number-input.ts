/**
 * Helpers para mostrar separadores de miles en campos numéricos de la interfaz.
 * El estado del formulario conserva el valor canónico (punto decimal); la UI usa
 * punto para miles y coma para decimales, como es habitual en es-CO.
 */
export const formatGroupedNumber = (value: string, allowDecimal = true): string => {
  if (!value) return "";

  const [integerRaw = "", fractionRaw] = allowDecimal ? value.split(".", 2) : [value];
  const integer = integerRaw.replace(/\D/g, "");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  if (!allowDecimal || fractionRaw === undefined) return grouped;

  const fraction = fractionRaw.replace(/\D/g, "");
  return fractionRaw === "" ? `${grouped},` : `${grouped || "0"},${fraction}`;
};

/** Convierte el texto localizado a una cadena numérica que Number() puede leer. */
export const parseGroupedNumber = (value: string, allowDecimal = true): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (!allowDecimal || !trimmed.includes(",")) {
    return trimmed.replace(/\D/g, "");
  }

  const comma = trimmed.indexOf(",");
  const integer = trimmed.slice(0, comma).replace(/\D/g, "");
  const fraction = trimmed.slice(comma + 1).replace(/\D/g, "");
  const whole = integer || "0";
  return trimmed.slice(comma + 1).length === 0 ? `${whole}.` : `${whole}.${fraction}`;
};

/** Calcula la posición del cursor después de volver a insertar puntos de miles. */
export const getGroupedNumberCaret = (
  formatted: string,
  meaningfulCharactersBeforeCaret: number,
  allowDecimal = true,
): number => {
  if (meaningfulCharactersBeforeCaret <= 0) return 0;

  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    const character = formatted[index];
    if (/\d/.test(character) || (allowDecimal && character === ",")) {
      seen += 1;
      if (seen === meaningfulCharactersBeforeCaret) return index + 1;
    }
  }
  return formatted.length;
};

export const countGroupedNumberCharacters = (value: string, allowDecimal = true): number =>
  [...value].filter((character) => /\d/.test(character) || (allowDecimal && character === ",")).length;
