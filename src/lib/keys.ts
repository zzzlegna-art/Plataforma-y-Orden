import type { KeyboardEvent } from "react";

/** Tipos de <input> en los que Enter equivale a "confirmar". */
const TIPOS_CON_ENTER = new Set([
  "text",
  "search",
  "email",
  "password",
  "number",
  "tel",
  "url",
  "date",
  "datetime-local",
  "time",
]);

/**
 * Manejador para que Enter confirme una acción desde los campos de un bloque.
 * Se pone en el contenedor (onKeyDown) y funciona con lo que se escriba dentro:
 * - Enter en un campo de una línea ejecuta la acción.
 * - En un área de texto Enter sigue dando salto de línea; Ctrl/Cmd + Enter confirma.
 * - No actúa sobre botones, casillas ni listas, ni si otro control ya atendió la tecla.
 */
export const onEnter =
  (accion: () => void | Promise<void>) => (evento: KeyboardEvent<HTMLElement>) => {
    if (evento.key !== "Enter" || evento.defaultPrevented || evento.nativeEvent.isComposing) {
      return;
    }
    const objetivo = evento.target;
    const esCampo = objetivo instanceof HTMLInputElement && TIPOS_CON_ENTER.has(objetivo.type);
    const esAreaConAtajo =
      objetivo instanceof HTMLTextAreaElement && (evento.ctrlKey || evento.metaKey);
    if (!esCampo && !esAreaConAtajo) return;
    evento.preventDefault();
    void accion();
  };
