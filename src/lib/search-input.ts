/**
 * Atributos para las barras de búsqueda. En el celular el teclado corrige, pone mayúsculas y
 * sugiere palabras solo; eso cambia lo que se escribe cuando se busca un SKU, un IMEI o el
 * nombre de un cliente ("RO-191" → "Ro-191", "iphone" → "Iphone"). Aquí se desactiva todo eso y
 * se pide el teclado de búsqueda.
 */
export const SEARCH_INPUT_PROPS = {
  inputMode: "search",
  enterKeyHint: "search",
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "none",
  spellCheck: false,
} as const;
