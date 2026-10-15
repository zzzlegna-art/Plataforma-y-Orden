/** Un IMEI válido tiene exactamente 15 dígitos. */
export const IMEI_LENGTH = 15;

/** Quita espacios y guiones, que a veces vienen en el IMEI impreso (35-345678-901234-5). */
export const normalizarImei = (raw: string) => raw.replace(/[\s-]/g, "");

/**
 * Verificación del dígito de control (algoritmo de Luhn). El último dígito del IMEI se
 * calcula a partir de los anteriores, así que una lectura mal hecha de la cámara casi
 * siempre falla esta prueba aunque tenga 15 dígitos.
 */
export const luhnValido = (digitos: string) => {
  let suma = 0;
  for (let i = 0; i < digitos.length; i += 1) {
    let valor = Number(digitos[digitos.length - 1 - i]);
    // Desde la derecha, se duplica un dígito sí y otro no (empezando por el segundo).
    if (i % 2 === 1) {
      valor *= 2;
      if (valor > 9) valor -= 9;
    }
    suma += valor;
  }
  return suma % 10 === 0;
};

export type ErrorImei = "errors.imeiInvalid" | "errors.imeiChecksum";

/** Clave del mensaje de error de un IMEI, o null si es válido. */
export const errorDeImei = (raw: string): ErrorImei | null => {
  const imei = normalizarImei(raw);
  if (!new RegExp(`^\\d{${IMEI_LENGTH}}$`).test(imei)) return "errors.imeiInvalid";
  if (!luhnValido(imei)) return "errors.imeiChecksum";
  return null;
};

export const esImeiValido = (raw: string) => errorDeImei(raw) === null;

/**
 * Código interno: cuando un equipo llega sin serial legible se le asigna un código
 * propio (p. ej. 000000000000123) que se etiqueta en el equipo. Empieza con muchos
 * ceros, algo que un IMEI real no hace (sus primeros 8 dígitos identifican al
 * fabricante), y es válido aunque no pase el dígito de control.
 */
export const esCodigoInterno = (raw: string) => {
  const codigo = normalizarImei(raw);
  return codigo.length <= IMEI_LENGTH + 1 && /^0{8,}\d+$/.test(codigo);
};

/** Como `errorDeImei`, pero admite además los códigos internos. */
export const errorDeSerialCelular = (raw: string): ErrorImei | null =>
  esCodigoInterno(raw) ? null : errorDeImei(raw);

/**
 * Genera un código interno único (8 ceros + 7 dígitos al azar) para un celular que
 * llega apagado y no se le puede leer el IMEI todavía. `enUso` recibe los seriales ya
 * ocupados (unidades activas + lo que va en la recepción actual) para no repetir.
 */
export const generarCodigoInterno = (enUso: (serial: string) => boolean): string => {
  for (let intento = 0; intento < 20; intento += 1) {
    const sufijo = String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
    const codigo = `00000000${sufijo}`;
    if (!enUso(codigo)) return codigo;
  }
  // Prácticamente imposible de llegar aquí (10 millones de combinaciones), pero por si acaso.
  throw new Error("No se pudo generar un código interno único");
};
