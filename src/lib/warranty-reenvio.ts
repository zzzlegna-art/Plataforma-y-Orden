import type { WarrantyView } from "./selectors";
import type { WarrantyResolution } from "./types";
import { getWarrantyOrigin, type WarrantyOrigin } from "./warranty-origin";

/** Filtros de la pestaña Reenvío de Garantías. Un valor vacío ("") significa "sin filtrar". */
export interface FiltroReenvio {
  /** Busca en código, serial/IMEI, cliente, producto, pedido y motivo. */
  texto: string;
  resolucion: "" | WarrantyResolution;
  origen: "" | WarrantyOrigin;
  /** Id del técnico. */
  tecnicoId: string;
  /** Fechas de recepción, formato AAAA-MM-DD (ambas inclusivas). */
  desde: string;
  hasta: string;
}

export const FILTRO_REENVIO_VACIO: FiltroReenvio = {
  texto: "",
  resolucion: "",
  origen: "",
  tecnicoId: "",
  desde: "",
  hasta: "",
};

export const hayFiltroReenvio = (filtro: FiltroReenvio): boolean =>
  Object.values(filtro).some((valor) => valor.trim() !== "");

/** Día local (AAAA-MM-DD) de una fecha ISO: así "5:30 p. m." cuenta como ese día y no el siguiente. */
export const diaLocal = (iso: string): string => {
  const fecha = new Date(iso);
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mes}-${dia}`;
};

const normalizar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Casos de Reenvío que cumplen TODOS los filtros activos. Conserva el orden recibido. */
export const filtrarReenvio = (vistas: WarrantyView[], filtro: FiltroReenvio): WarrantyView[] => {
  const q = normalizar(filtro.texto.trim());
  return vistas.filter((vista) => {
    const { warranty } = vista;
    if (filtro.resolucion && warranty.resolucion !== filtro.resolucion) return false;
    if (filtro.origen && getWarrantyOrigin(warranty, vista.order) !== filtro.origen) return false;
    if (filtro.tecnicoId && vista.tecnico?.id !== filtro.tecnicoId) return false;
    const dia = diaLocal(warranty.receivedAt);
    if (filtro.desde && dia < filtro.desde) return false;
    if (filtro.hasta && dia > filtro.hasta) return false;
    if (q) {
      const pajar = normalizar(
        [
          warranty.code,
          vista.unit?.serial,
          warranty.imeiManual,
          vista.customer?.name,
          warranty.clienteManual,
          vista.product?.name,
          warranty.referenciaManual,
          vista.order?.code,
          warranty.reason,
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (!pajar.includes(q)) return false;
    }
    return true;
  });
};
