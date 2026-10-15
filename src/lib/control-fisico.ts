/**
 * Control físico de seriales: orden de la lista, conteo del avance y resumen final.
 *
 * Son funciones puras (sin pantalla ni servidor). El servidor decide qué unidades quedan
 * marcadas; aquí solo se interpreta lo que ya está guardado.
 */

import type { Product, Unit, UnitStatus } from "./types";

/**
 * Orden en que se muestran las unidades: primero las que están en bodega y, después, el
 * resto agrupado por estado, de lo más cercano a "disponible" a lo menos.
 */
export const PRIORIDAD_ESTADO: Record<UnitStatus, number> = {
  en_bodega: 0,
  en_local: 1,
  en_transito: 2,
  en_reparacion: 3,
  defectuoso: 4,
  entregado_garantia: 5,
  vendido: 6,
  liberado: 7,
};

const prioridad = (estado: UnitStatus) => PRIORIDAD_ESTADO[estado] ?? 99;

/** En bodega primero; dentro de cada estado, lo recibido más recientemente y luego por serial. */
export const ordenarUnidades = <T extends { unit: Unit }>(filas: T[]): T[] =>
  [...filas].sort(
    (a, b) =>
      prioridad(a.unit.status) - prioridad(b.unit.status) ||
      b.unit.receivedAt.localeCompare(a.unit.receivedAt) ||
      a.unit.serial.localeCompare(b.unit.serial),
  );

/** Un serial escaneado o escrito se compara sin espacios ni mayúsculas. */
export const normalizarSerial = (serial: string) => serial.trim().toLowerCase();

/**
 * Fecha ISO a milisegundos. La base devuelve microsegundos (".123456"); se recortan a
 * milisegundos porque no todos los navegadores aceptan más de 3 decimales.
 */
export const aMilisegundos = (iso: string | undefined): number => {
  if (!iso) return Number.NaN;
  return Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));
};

export const controlActivo = (product: Pick<Product, "controlStartedAt">) =>
  Boolean(product.controlStartedAt);

/** ¿Esta unidad ya se verificó físicamente en el control en curso? */
export const esVerificada = (
  unit: Pick<Unit, "checkedAt">,
  product: Pick<Product, "controlStartedAt">,
): boolean => {
  if (!product.controlStartedAt || !unit.checkedAt) return false;
  const marca = aMilisegundos(unit.checkedAt);
  const inicio = aMilisegundos(product.controlStartedAt);
  return Number.isFinite(marca) && Number.isFinite(inicio) && marca >= inicio;
};

export interface EstadoControl {
  activo: boolean;
  /** Unidades que el sistema dice que están en bodega (las que se deben encontrar). */
  esperadas: number;
  /** De las esperadas, cuántas ya se verificaron. */
  verificadas: number;
  /** Esperadas que todavía no se han verificado. */
  faltan: Unit[];
  /** Verificadas (las tienes en la mano) pero el sistema NO las tiene en bodega. */
  fueraDeEstado: Unit[];
  /** Avance de 0 a 100. */
  porcentaje: number;
}

/** Avance del control sobre las unidades dadas (normalmente las que muestra la lista). */
export const estadoControl = (
  product: Pick<Product, "controlStartedAt">,
  units: Unit[],
): EstadoControl => {
  const activo = controlActivo(product);
  const esperadas = units.filter((unit) => unit.status === "en_bodega");
  const verificadas = esperadas.filter((unit) => esVerificada(unit, product));
  const faltan = esperadas.filter((unit) => !esVerificada(unit, product));
  const fueraDeEstado = units.filter(
    (unit) => unit.status !== "en_bodega" && esVerificada(unit, product),
  );
  return {
    activo,
    esperadas: esperadas.length,
    verificadas: verificadas.length,
    faltan,
    fueraDeEstado,
    porcentaje: esperadas.length === 0 ? 0 : Math.round((verificadas.length / esperadas.length) * 100),
  };
};

const MAX_SERIALES_EN_RESUMEN = 15;

const listar = (seriales: string[]) =>
  seriales.length <= MAX_SERIALES_EN_RESUMEN
    ? seriales.join(", ")
    : `${seriales.slice(0, MAX_SERIALES_EN_RESUMEN).join(", ")} y ${seriales.length - MAX_SERIALES_EN_RESUMEN} más`;

/**
 * Texto que queda en la auditoría al cerrar el control. La auditoría es un registro en
 * español (igual que el resto de sus detalles): no depende del idioma de la pantalla.
 */
export const resumenControl = (
  estado: EstadoControl,
  extras: { noEncontrados?: string[]; estadoDe?: (unit: Unit) => string; alcance?: string } = {},
): string => {
  const partes = [
    `${extras.alcance ? `${extras.alcance}: ` : ""}${estado.verificadas} de ${estado.esperadas} en bodega verificados`,
  ];
  if (estado.faltan.length > 0) {
    partes.push(`faltan ${estado.faltan.length}: ${listar(estado.faltan.map((u) => u.serial))}`);
  }
  if (estado.fueraDeEstado.length > 0) {
    partes.push(
      `fuera de estado ${estado.fueraDeEstado.length}: ${listar(
        estado.fueraDeEstado.map((u) => `${u.serial} (${extras.estadoDe?.(u) ?? u.status})`),
      )}`,
    );
  }
  const noEncontrados = extras.noEncontrados ?? [];
  if (noEncontrados.length > 0) {
    partes.push(`no registrados ${noEncontrados.length}: ${listar(noEncontrados)}`);
  }
  return partes.join(" · ");
};
