/**
 * Vibración corta en el celular al confirmar algo (por ejemplo, marcar un serial en el
 * control físico). No hace nada si el dispositivo o el navegador no lo soportan (por ejemplo
 * iPhone/Safari), y nunca lanza un error si falla.
 */
export const vibrarSiDisponible = (patronMs: number | number[]): void => {
  try {
    navigator.vibrate?.(patronMs);
  } catch {
    // Algunos navegadores exigen una interacción reciente del usuario y lanzan si no la hay;
    // se ignora, la vibración es un extra, no algo de lo que dependa la función.
  }
};
