import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useStore } from "@/hooks/use-store";
import {
  controlFinalizar,
  controlIniciar,
  controlMarcarSerial,
  controlMarcarUnidad,
} from "@/lib/backend";
import {
  esVerificada,
  normalizarSerial,
  resumenControl,
  type EstadoControl,
} from "@/lib/control-fisico";
import { DomainError } from "@/lib/db";
import { vibrarSiDisponible } from "@/lib/haptics";
import type { Product, Unit, UnitCondition } from "@/lib/types";

/** Último resultado de un escaneo, para mostrarlo bajo la barra. */
export interface AvisoEscaneo {
  id: number;
  tono: "ok" | "aviso" | "error";
  texto: string;
}

/** Fila que se acaba de marcar: para el destello breve en la lista (ver seriales-section). */
export interface RecienMarcada {
  unitId: string;
  tono: "success" | "warning";
}

/**
 * Operaciones del control físico. Cada marca la guarda el servidor con su propia función
 * (solo toca las columnas del control) y aquí se refleja en pantalla al instante.
 */
export const useControlFisico = (product: Product, filtro?: UnitCondition) => {
  const { t } = useTranslation();
  const { db, aplicarCambios } = useStore();
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<AvisoEscaneo | null>(null);
  const [noEncontrados, setNoEncontrados] = useState<string[]>([]);
  const [recienMarcada, setRecienMarcada] = useState<RecienMarcada | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mostrarAviso = useCallback((tono: AvisoEscaneo["tono"], texto: string) => {
    setAviso({ id: Date.now(), tono, texto });
  }, []);

  /** Destello breve en la fila recién marcada, con una vibración cortita si el celular la trae. */
  const destacarFila = useCallback((unitId: string, tono: RecienMarcada["tono"]) => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setRecienMarcada({ unitId, tono });
    vibrarSiDisponible(tono === "success" ? 15 : [10, 40, 15]);
    flashTimeoutRef.current = setTimeout(() => setRecienMarcada(null), 800);
  }, []);

  const fallar = useCallback(
    (error: unknown) => {
      toast.error(error instanceof DomainError ? t(error.key, error.params) : t("errors.unexpected"));
    },
    [t],
  );

  const aplicarProducto = useCallback(
    (item: Product) => aplicarCambios([{ coleccion: "products", tipo: "guardar", item }]),
    [aplicarCambios],
  );
  const aplicarUnidad = useCallback(
    (item: Unit) => aplicarCambios([{ coleccion: "units", tipo: "guardar", item }]),
    [aplicarCambios],
  );

  const registrarNoEncontrado = useCallback((serial: string) => {
    const limpio = serial.trim();
    setNoEncontrados((actual) =>
      actual.some((item) => normalizarSerial(item) === normalizarSerial(limpio))
        ? actual
        : [...actual, limpio],
    );
  }, []);

  /** Inicia el control, o lo reinicia si ya había uno en curso. */
  const iniciar = useCallback(
    async (reinicio = false) => {
      setOcupado(true);
      try {
        aplicarProducto(await controlIniciar(product.id));
        setNoEncontrados([]);
        setAviso(null);
        toast.success(t(reinicio ? "control.restarted" : "control.started"));
      } catch (error) {
        fallar(error);
      } finally {
        setOcupado(false);
      }
    },
    [aplicarProducto, fallar, product.id, t],
  );

  /**
   * Revisión inmediata (con lo que hay en pantalla) antes de molestar al servidor: da el aviso
   * en el acto —pitido y marca roja en la cámara— cuando el serial no sirve. El servidor
   * vuelve a decidir con sus propios datos.
   */
  const validar = useCallback(
    (serial: string): string | null => {
      const buscado = normalizarSerial(serial);
      const unidades = db.units.filter((unit) => normalizarSerial(unit.serial) === buscado);
      const activa = unidades.find((unit) => unit.status !== "liberado");
      if (!activa) {
        if (unidades.length > 0) return t("control.scan.liberated", { serial: serial.trim() });
        registrarNoEncontrado(serial);
        return t("control.scan.unknown", { serial: serial.trim() });
      }
      if (activa.productId !== product.id) {
        const otro = db.products.find((item) => item.id === activa.productId);
        return t("control.scan.otherProduct", { producto: otro?.name ?? "—" });
      }
      if (esVerificada(activa, product)) {
        return t("control.scan.already", { serial: activa.serial });
      }
      return null;
    },
    [db.products, db.units, product, registrarNoEncontrado, t],
  );

  /** Se llama con cada serial que pasa la revisión: lo marca en el servidor. */
  const escanear = useCallback(
    async (serial: string) => {
      try {
        const r = await controlMarcarSerial(product.id, serial);
        if ("unidad" in r) aplicarUnidad(r.unidad);
        switch (r.resultado) {
          case "verificada":
            // Con un filtro de condición activo, un equipo de otra condición queda verificado
            // pero no aparece en la lista ni suma al avance: se avisa para que no confunda.
            if (filtro && r.unidad.condition !== filtro) {
              mostrarAviso(
                "aviso",
                t("control.scan.outsideFilter", {
                  serial: r.unidad.serial,
                  condicion: t(`condition.${r.unidad.condition}`).toLowerCase(),
                  filtro: t(`condition.${filtro}`).toLowerCase(),
                }),
              );
            } else {
              mostrarAviso("ok", t("control.scan.ok", { serial: r.unidad.serial }));
            }
            destacarFila(r.unidad.id, "success");
            break;
          case "ya_verificada":
            mostrarAviso("aviso", t("control.scan.already", { serial: r.unidad.serial }));
            break;
          case "fuera_de_estado": {
            const texto = t("control.scan.outOfState", {
              serial: r.unidad.serial,
              estado: t(`unitStatus.${r.unidad.status}`),
            });
            mostrarAviso("aviso", texto);
            toast.warning(texto);
            destacarFila(r.unidad.id, "warning");
            break;
          }
          case "otro_producto":
            mostrarAviso("error", t("control.scan.otherProduct", { producto: r.producto }));
            break;
          case "liberada":
            mostrarAviso("error", t("control.scan.liberated", { serial: r.serial }));
            break;
          case "no_existe":
            registrarNoEncontrado(r.serial);
            mostrarAviso("error", t("control.scan.unknown", { serial: r.serial }));
            break;
        }
      } catch (error) {
        fallar(error);
      }
    },
    [aplicarUnidad, destacarFila, fallar, filtro, mostrarAviso, product.id, registrarNoEncontrado, t],
  );

  /** Marca o desmarca a mano una unidad de la lista. */
  const alternarUnidad = useCallback(
    async (unit: Unit) => {
      const marcando = !esVerificada(unit, product);
      try {
        const actualizada = await controlMarcarUnidad(unit.id, marcando);
        aplicarUnidad(actualizada);
        if (marcando) destacarFila(actualizada.id, actualizada.status === "en_bodega" ? "success" : "warning");
      } catch (error) {
        fallar(error);
      }
    },
    [aplicarUnidad, destacarFila, fallar, product],
  );

  /** Cierra el control y deja el resumen en la auditoría. */
  const finalizar = useCallback(
    async (estado: EstadoControl, alcance?: string) => {
      setOcupado(true);
      try {
        const resumen = resumenControl(estado, {
          noEncontrados,
          alcance,
          estadoDe: (unit) => t(`unitStatus.${unit.status}`),
        });
        aplicarProducto(await controlFinalizar(product.id, resumen));
        setNoEncontrados([]);
        setAviso(null);
        toast.success(t("control.finished"));
        return true;
      } catch (error) {
        fallar(error);
        return false;
      } finally {
        setOcupado(false);
      }
    },
    [aplicarProducto, fallar, noEncontrados, product.id, t],
  );

  return { ocupado, aviso, noEncontrados, recienMarcada, iniciar, validar, escanear, alternarUnidad, finalizar };
};

export type ControlFisico = ReturnType<typeof useControlFisico>;
