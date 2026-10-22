import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  registro: [] as { tabla: string; op: string; n: number; opciones?: unknown }[],
  errorEnTabla: null as { message: string; code?: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from, channel: vi.fn(), removeChannel: vi.fn() },
}));

import { createOrder } from "./actions/orders";
import {
  calcularPasos,
  controlFinalizar,
  controlIniciar,
  controlMarcarSerial,
  controlMarcarUnidad,
  consultarPerfilSesion,
  importarSerialesPreviosEnLote,
  pullDb,
  pushDb,
  reiniciarModoDeGuardado,
} from "./backend";
import { cloneDb, DomainError, emptyDb } from "./db";
import type { Db } from "./types";

const ahora = "2026-09-21T12:00:00.000Z";

/** Inventario con un pedido en preparación que tiene un IMEI asignado. */
const antesDeDespachar = (): Db => {
  const db = emptyDb();
  db.orders.push({ id: "o1", code: "PED-260921-001", customerId: "", status: "en_preparacion", orderDate: ahora, total: 100, createdBy: "", createdAt: ahora, updatedAt: ahora });
  db.orderItems.push({ id: "oi1", orderId: "o1", productId: "", quantity: 1, unitPrice: 100, subtotal: 100 });
  db.orderItemUnits.push({ id: "oiu1", orderItemId: "oi1", unitId: "u1", createdAt: ahora });
  db.units.push({ id: "u1", productId: "", serial: "350000000000001", condition: "nuevo", status: "en_bodega", receivedAt: ahora, createdBy: "" });
  return db;
};

/** El mismo inventario después de despachar: cambia el pedido y la unidad, y se suman rastros. */
const despachado = (db: Db): Db => {
  const sig = cloneDb(db);
  sig.orders[0].status = "despachado";
  sig.units[0].status = "vendido";
  sig.movements.unshift({ id: "m1", productId: "", unitId: "u1", type: "salida", quantity: 1, referenceType: "pedido", referenceId: "o1", createdBy: "", createdAt: ahora });
  sig.auditLogs.unshift({ id: "a1", userId: "", userEmail: "a@x.com", action: "status", entity: "order", entityId: "o1", createdAt: ahora });
  return sig;
};

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.registro.length = 0;
  mocks.errorEnTabla = null;
  reiniciarModoDeGuardado();
  mocks.from.mockImplementation((tabla: string) => ({
    upsert: async (filas: unknown[], opciones: unknown) => {
      mocks.registro.push({ tabla, op: "upsert", n: filas.length, opciones });
      return { error: mocks.errorEnTabla };
    },
    insert: async (filas: unknown[]) => {
      mocks.registro.push({ tabla, op: "insert", n: filas.length });
      return { error: mocks.errorEnTabla };
    },
    delete: () => ({
      in: async (_columna: string, ids: string[]) => {
        mocks.registro.push({ tabla, op: "delete", n: ids.length });
        return { error: mocks.errorEnTabla };
      },
    }),
  }));
});

describe("importarSerialesPreviosEnLote", () => {
  it("envía el lote al RPC y devuelve filas nuevas y auditoría", async () => {
    const auditoria = {
      id: "22345678-1234-1234-1234-123456789012",
      userId: "admin-1",
      userEmail: "admin@example.com",
      action: "create",
      entity: "serial_previo",
      entityId: null,
      details: "1 seriales previos importados (lote)",
      createdAt: ahora,
    };
    mocks.rpc.mockResolvedValue({
      data: { importados: 1, duplicados: 1, auditoria },
      error: null,
    });

    const resultado = await importarSerialesPreviosEnLote(["SP-001", "sp-001"]);

    expect(mocks.rpc).toHaveBeenCalledWith("nexora_importar_seriales_previos", {
      p_seriales: ["SP-001", "sp-001"],
      p_notas: null,
    });
    expect(resultado.importados).toBe(1);
    expect(resultado.duplicados).toBe(1);
    expect(resultado.auditoria).toMatchObject({
      userId: "admin-1",
      entity: "serial_previo",
      entityId: undefined,
    });
  });

  it("rechaza lotes mayores de 20.000 antes de llamar al servidor", async () => {
    await expect(
      importarSerialesPreviosEnLote(Array.from({ length: 20_001 }, (_, i) => `SP-${i}`)),
    ).rejects.toMatchObject({ key: "serialesPrevios.excelErrorTooMany" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("traduce el rechazo del servidor para un usuario sin permiso", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "BODEGA_FORBIDDEN" },
    });

    await expect(importarSerialesPreviosEnLote(["SP-001"])).rejects.toMatchObject({
      key: "errors.forbidden",
    });
  });
});

describe("consultarPerfilSesion", () => {
  it("lee el perfil actual de la cuenta autenticada", async () => {
    const perfil = {
      id: "worker-1",
      email: "worker@example.com",
      full_name: "Trabajador",
      role: "bodeguero",
      is_active: true,
    };
    const maybeSingle = vi.fn().mockResolvedValue({ data: perfil, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select } as never);

    await expect(consultarPerfilSesion("worker-1")).resolves.toEqual(perfil);
    expect(mocks.from).toHaveBeenCalledWith("bodega_profiles");
    expect(select).toHaveBeenCalledWith("*");
    expect(eq).toHaveBeenCalledWith("id", "worker-1");
  });

  it("propaga errores de red para no confundirlos con una cuenta desactivada", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "network unavailable" },
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select } as never);

    await expect(consultarPerfilSesion("worker-1")).rejects.toThrow(
      "No se pudo verificar el perfil: network unavailable",
    );
  });
});

describe("calcularPasos", () => {
  it("serializa la entidad de tipo de producto con el identificador SQL normalizado", () => {
    const previo = emptyDb();
    const siguiente = cloneDb(previo);
    siguiente.auditLogs.push({
      id: "audit-product-type",
      userId: "u1",
      userEmail: "admin@nexora.test",
      action: "create",
      entity: "productType",
      entityId: "pt1",
      details: "Parlantes",
      createdAt: ahora,
    });

    const paso = calcularPasos(previo, siguiente).find((item) => item.tabla === "bodega_audit_logs");
    expect(paso?.op === "upsert" ? paso.filas[0].entity : undefined).toBe("product_type");
  });

  it("no genera nada si no hay cambios", () => {
    const db = antesDeDespachar();
    expect(calcularPasos(db, cloneDb(db))).toEqual([]);
  });

  it("agrega/modifica en orden de referencias, borra al revés y deja los ajustes al final", () => {
    const previo = antesDeDespachar();
    const sig = despachado(previo);
    sig.orderItemUnits = [];
    sig.orderItems = [];
    sig.settings = { currency: "COP", companyName: "Bodega 6A" };

    const pasos = calcularPasos(previo, sig);
    expect(pasos.map((p) => `${p.op}:${p.tabla}`)).toEqual([
      "upsert:bodega_orders",
      "upsert:bodega_units",
      "upsert:bodega_movements",
      "upsert:bodega_audit_logs",
      "borrar:bodega_order_item_units", // se borra primero lo que depende de otra tabla
      "borrar:bodega_order_items",
      "upsert:bodega_settings",
    ]);
  });

  it("inserta eventos de garantía sin usar upsert", () => {
    const previo = emptyDb();
    const siguiente = cloneDb(previo);
    siguiente.warrantyEvents.push({
      id: "we1", warrantyId: "w1", status: "recibido",
      createdBy: "u1", createdAt: ahora,
    });
    expect(calcularPasos(previo, siguiente)).toContainEqual(
      expect.objectContaining({
        op: "upsert", tabla: "bodega_warranty_events", solo_alta: true,
      }),
    );
  });

  it("rechaza modificaciones de eventos históricos", () => {
    const previo = emptyDb();
    previo.warrantyEvents.push({
      id: "we1", warrantyId: "w1", status: "recibido",
      createdBy: "u1", createdAt: ahora,
    });
    const siguiente = cloneDb(previo);
    siguiente.warrantyEvents[0].notes = "alterado";
    expect(() => calcularPasos(previo, siguiente)).toThrow(DomainError);
  });

  it("rechaza la eliminación de eventos históricos", () => {
    const previo = emptyDb();
    previo.warrantyEvents.push({
      id: "we1", warrantyId: "w1", status: "recibido",
      createdBy: "u1", createdAt: ahora,
    });
    const siguiente = cloneDb(previo);
    siguiente.warrantyEvents = [];
    expect(() => calcularPasos(previo, siguiente)).toThrow(DomainError);
  });

  it("una garantía sin reemplazo no envía la columna replacement_unit_id (no depende de la migración 0012)", () => {
    const previo = emptyDb();
    const sig = cloneDb(previo);
    sig.warranties.push({
      id: "w1", code: "GAR-1", unitId: "u1", productId: "", reason: "no enciende",
      status: "recibido", receivedAt: ahora, createdBy: "",
    });
    const paso = calcularPasos(previo, sig).find((p) => p.tabla === "bodega_warranties");
    expect(paso?.op).toBe("upsert");
    if (paso?.op === "upsert") {
      expect(Object.keys(paso.filas[0])).not.toContain("replacement_unit_id");
    }
  });

  it("una garantía con reemplazo elegido sí envía replacement_unit_id", () => {
    const previo = emptyDb();
    const sig = cloneDb(previo);
    sig.warranties.push({
      id: "w1", code: "GAR-1", unitId: "u1", productId: "", reason: "no enciende",
      status: "reenvio_pendiente", resolucion: "cambio", replacementUnitId: "u2",
      receivedAt: ahora, createdBy: "",
    });
    const paso = calcularPasos(previo, sig).find((p) => p.tabla === "bodega_warranties");
    expect(paso?.op === "upsert" && paso.filas[0].replacement_unit_id).toBe("u2");
  });

  it("marca como 'solo alta' las bitácoras y no el resto", () => {
    const previo = antesDeDespachar();
    const pasos = calcularPasos(previo, despachado(previo));
    const soloAlta = Object.fromEntries(pasos.map((p) => [p.tabla, p.op === "upsert" ? p.solo_alta : null]));
    expect(soloAlta).toMatchObject({ bodega_orders: false, bodega_units: false, bodega_movements: true, bodega_audit_logs: true });
  });

  it("convierte los identificadores vacíos en null (la base espera uuid)", () => {
    const previo = antesDeDespachar();
    const pasos = calcularPasos(previo, despachado(previo));
    const unidades = pasos.find((p) => p.tabla === "bodega_units");
    expect(unidades?.op === "upsert" && unidades.filas[0].created_by).toBeNull();
    expect(unidades?.op === "upsert" && unidades.filas[0].product_id).toBeNull();
  });
});

describe("pushDb · guardado atómico", () => {
  it("con la función disponible: UNA sola llamada, sin tocar tabla por tabla", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const previo = antesDeDespachar();
    await pushDb(previo, despachado(previo));

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    const [nombre, args] = mocks.rpc.mock.calls[0];
    expect(nombre).toBe("nexora_guardar_con_version");
    expect(args.p_cambios.version).toBe(1);
    expect(args.p_cambios.pasos.map((p: { tabla: string }) => p.tabla)).toEqual(["bodega_orders", "bodega_units", "bodega_movements", "bodega_audit_logs"]);
    expect(mocks.registro).toEqual([]);
  });

  it("no llama a nada si no hay cambios", async () => {
    const db = antesDeDespachar();
    await pushDb(db, cloneDb(db));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.registro).toEqual([]);
  });
});

describe("pushDb  guardado atomico obligatorio", () => {
  const sinFuncion = {
    data: null,
    error: {
      code: "PGRST202",
      message: "Could not find the function public.bodega_aplicar_cambios(p_cambios)",
    },
  };

  it("rechaza el guardado si la funcion RPC no existe", async () => {
    mocks.rpc.mockResolvedValue(sinFuncion);
    const previo = antesDeDespachar();
    await expect(pushDb(previo, despachado(previo))).rejects.toMatchObject({ key: "errors.saveFailed" });
    expect(mocks.registro).toEqual([]);
  });

  it("comprueba la RPC de nuevo en cada intento", async () => {
    mocks.rpc.mockResolvedValue(sinFuncion);
    const previo = antesDeDespachar();
    await expect(pushDb(previo, despachado(previo))).rejects.toBeInstanceOf(DomainError);
    await expect(pushDb(previo, despachado(previo))).rejects.toBeInstanceOf(DomainError);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.registro).toEqual([]);
  });

  it("rechaza formatos incompatibles sin guardar por tablas", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "BODEGA_CAMBIOS_VERSION:2" } });
    const previo = antesDeDespachar();
    await expect(pushDb(previo, despachado(previo))).rejects.toMatchObject({ key: "errors.saveFailed" });
    expect(mocks.registro).toEqual([]);
  });

  it("no divide operaciones de 450 filas en guardados parciales", async () => {
    mocks.rpc.mockResolvedValue(sinFuncion);
    const sig = emptyDb();
    for (let i = 0; i < 450; i += 1) {
      sig.units.push({ id: `u${i}`, productId: "", serial: `S${i}`, condition: "nuevo", status: "en_bodega", receivedAt: ahora, createdBy: "" });
    }
    await expect(pushDb(emptyDb(), sig)).rejects.toBeInstanceOf(DomainError);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.registro).toEqual([]);
  });

  it("rechaza paquetes demasiado grandes sin escribir parcialmente", async () => {
    const sig = emptyDb();
    const relleno = "x".repeat(1500);
    for (let i = 0; i < 2500; i += 1) {
      sig.units.push({ id: `u${i}`, productId: "", serial: `S${i}`, condition: "nuevo", status: "en_bodega", notes: relleno, receivedAt: ahora, createdBy: "" });
    }
    await expect(pushDb(emptyDb(), sig)).rejects.toMatchObject({ key: "errors.saveFailed" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.registro).toEqual([]);
  });

  it("rechaza respuestas RPC sin confirmacion explicita", async () => {
    const previo = antesDeDespachar();
    for (const data of [null, {}, { ok: false }, { ok: "true" }]) {
      mocks.rpc.mockResolvedValue({ data, error: null });
      await expect(pushDb(previo, despachado(previo))).rejects.toMatchObject({ key: "errors.saveFailed" });
    }
    expect(mocks.registro).toEqual([]);
  });
});
describe("pushDb · rechazos del servidor (NO se reintentan por tablas)", () => {
  const rechazo = async (error: { message: string; code?: string }) => {
    mocks.rpc.mockResolvedValue({ data: null, error });
    const previo = antesDeDespachar();
    let capturado: unknown;
    try {
      await pushDb(previo, despachado(previo));
    } catch (e) {
      capturado = e;
    }
    expect(mocks.registro).toEqual([]); // no hubo un segundo intento parcial
    expect(capturado).toBeInstanceOf(DomainError);
    return capturado as DomainError;
  };

  it("IMEI ya asignado a otro pedido", async () => {
    const e = await rechazo({ message: "BODEGA_UNIDAD_YA_ASIGNADA:350000000000001", code: "P0001" });
    expect(e.key).toBe("errors.unitAlreadyAssigned");
  });

  it("unidad no disponible, con su serial", async () => {
    const e = await rechazo({ message: "BODEGA_UNIDAD_NO_DISPONIBLE:350000000000009", code: "P0001" });
    expect(e.key).toBe("errors.unitNotAvailable");
    expect(e.params).toEqual({ serial: "350000000000009" });
  });

  it("dato duplicado o cruce de dos guardados: 'inténtalo de nuevo'", async () => {
    expect((await rechazo({ message: 'duplicate key value violates unique constraint "x"', code: "23505" })).key).toBe("errors.saveConflict");
    expect((await rechazo({ message: "deadlock detected", code: "40P01" })).key).toBe("errors.saveConflict");
  });

  it("permisos (RLS) o corte de red: aviso genérico, sin reintento", async () => {
    expect((await rechazo({ message: "new row violates row-level security policy", code: "42501" })).key).toBe("errors.saveFailed");
    expect((await rechazo({ message: "TypeError: Failed to fetch" })).key).toBe("errors.saveFailed");
  });

  it("un rechazo NO desactiva el guardado atómico para los siguientes", async () => {
    await rechazo({ message: "BODEGA_UNIDAD_YA_ASIGNADA:x", code: "P0001" });
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const previo = antesDeDespachar();
    await pushDb(previo, despachado(previo));
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.registro).toEqual([]);
  });
});

describe("control físico · las escrituras normales NO tocan las marcas", () => {
  it("una unidad con marca de control no envía checked_at ni checked_by", () => {
    const previo = antesDeDespachar();
    const sig = cloneDb(previo);
    sig.units[0].status = "vendido";
    sig.units[0].checkedAt = "2026-09-21T16:00:00.123456+00:00";
    sig.units[0].checkedBy = "u9";
    const paso = calcularPasos(previo, sig).find((p) => p.tabla === "bodega_units");
    expect(paso?.op).toBe("upsert");
    const filaEnviada = paso?.op === "upsert" ? paso.filas[0] : {};
    expect(filaEnviada).not.toHaveProperty("checked_at");
    expect(filaEnviada).not.toHaveProperty("checked_by");
    expect(filaEnviada.status).toBe("vendido");
  });

  it("un producto con control en curso no envía control_started_at", () => {
    const previo = antesDeDespachar();
    previo.products.push({ id: "p1", sku: "S", name: "iPhone", price: 1, cost: 1, minStock: 0, isActive: true, createdAt: ahora, updatedAt: ahora });
    const sig = cloneDb(previo);
    sig.products[0].name = "iPhone 14";
    sig.products[0].controlStartedAt = "2026-09-21T15:00:00+00:00";
    const paso = calcularPasos(previo, sig).find((p) => p.tabla === "bodega_products");
    const filaEnviada = paso?.op === "upsert" ? paso.filas[0] : {};
    expect(filaEnviada).not.toHaveProperty("control_started_at");
    expect(filaEnviada).not.toHaveProperty("control_started_by");
    expect(filaEnviada.name).toBe("iPhone 14");
  });
});

describe("control físico · llamadas al servidor", () => {
  const filaUnidad = { id: "u1", product_id: "p1", serial: "350000000000001", unit_condition: "nuevo", status: "en_bodega", received_at: ahora, checked_at: "2026-09-21T16:00:00.123456+00:00", checked_by: "b1" };
  const filaProducto = { id: "p1", sku: "S", name: "iPhone 14", price: 1, cost: 1, min_stock: 0, is_active: true, created_at: ahora, updated_at: ahora, control_started_at: "2026-09-21T15:00:00.5+00:00", control_started_by: "b1" };

  it("iniciar: llama a la función con el producto y devuelve el producto con su inicio", async () => {
    mocks.rpc.mockResolvedValue({ data: filaProducto, error: null });
    const producto = await controlIniciar("p1");
    expect(mocks.rpc).toHaveBeenCalledWith("bodega_control_iniciar", { p_product_id: "p1" });
    expect(producto.controlStartedAt).toBe("2026-09-21T15:00:00.5+00:00");
    expect(producto.controlStartedBy).toBe("b1");
  });

  it("marcar serial: entiende cada resultado del servidor", async () => {
    mocks.rpc.mockResolvedValue({ data: { resultado: "verificada", unidad: filaUnidad }, error: null });
    const ok = await controlMarcarSerial("p1", " 350000000000001 ");
    expect(mocks.rpc).toHaveBeenCalledWith("bodega_control_marcar_serial", { p_product_id: "p1", p_serial: " 350000000000001 " });
    expect(ok.resultado).toBe("verificada");
    expect("unidad" in ok && ok.unidad.checkedAt).toBe("2026-09-21T16:00:00.123456+00:00");

    mocks.rpc.mockResolvedValue({ data: { resultado: "fuera_de_estado", unidad: { ...filaUnidad, status: "vendido" } }, error: null });
    const fuera = await controlMarcarSerial("p1", "x");
    expect("unidad" in fuera && fuera.unidad.status).toBe("vendido");

    mocks.rpc.mockResolvedValue({ data: { resultado: "otro_producto", serial: "360", producto: "Otro" }, error: null });
    expect(await controlMarcarSerial("p1", "360")).toEqual({ resultado: "otro_producto", serial: "360", producto: "Otro" });

    mocks.rpc.mockResolvedValue({ data: { resultado: "no_existe", serial: "999" }, error: null });
    expect(await controlMarcarSerial("p1", "999")).toEqual({ resultado: "no_existe", serial: "999" });

    mocks.rpc.mockResolvedValue({ data: { resultado: "liberada", serial: "111" }, error: null });
    expect((await controlMarcarSerial("p1", "111")).resultado).toBe("liberada");
  });

  it("marcar/desmarcar a mano y finalizar usan sus funciones", async () => {
    mocks.rpc.mockResolvedValue({ data: filaUnidad, error: null });
    const unidad = await controlMarcarUnidad("u1", true);
    expect(mocks.rpc).toHaveBeenCalledWith("bodega_control_marcar_unidad", { p_unit_id: "u1", p_verificada: true });
    expect(unidad.checkedBy).toBe("b1");

    mocks.rpc.mockResolvedValue({ data: { ...filaProducto, control_started_at: null, control_started_by: null }, error: null });
    const cerrado = await controlFinalizar("p1", "resumen");
    expect(mocks.rpc).toHaveBeenCalledWith("bodega_control_finalizar", { p_product_id: "p1", p_resumen: "resumen" });
    expect(cerrado.controlStartedAt).toBeUndefined();
  });

  it("traduce los errores del servidor a avisos entendibles", async () => {
    const claveDe = async (error: { message: string; code?: string }) => {
      mocks.rpc.mockResolvedValue({ data: null, error });
      return controlIniciar("p1").then(() => "", (e: DomainError) => e.key);
    };
    expect(await claveDe({ code: "PGRST202", message: "Could not find the function public.bodega_control_iniciar" })).toBe("control.notAvailable");
    expect(await claveDe({ message: "BODEGA_CONTROL_NO_ACTIVO", code: "P0001" })).toBe("control.notActive");
    expect(await claveDe({ message: "BODEGA_CONTROL_PRODUCTO_NO_EXISTE", code: "P0001" })).toBe("errors.notFound");
    expect(await claveDe({ message: "TypeError: Failed to fetch" })).toBe("errors.saveFailed");
  });
});

describe("orderDate / deliveryDate · fecha del pedido no se corre un día por la zona horaria", () => {
  /** Simula lo que responde Supabase: una sola tabla con filas fijas; el resto, vacías. */
  const servidorCon = (filasOrders: Record<string, unknown>[]) => {
    mocks.from.mockImplementation((tabla: string) => {
      const encadenable = {
        order: () => encadenable,
        eq: () => encadenable,
        range: async () => ({ data: tabla === "bodega_orders" ? filasOrders : [], error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return { select: () => encadenable };
    });
  };

  it("una fila del servidor con la medianoche en UTC (como quedó en producción) se lee como ese mismo día", async () => {
    // Exactamente lo que devolvió Supabase para PED-260921-001/002 antes de esta corrección.
    servidorCon([
      { id: "o1", code: "PED-260921-001", status: "despachado", order_date: "2026-09-21T00:00:00+00:00", delivery_date: "2026-09-21T00:00:00+00:00", total: 0 },
    ]);
    const db = await pullDb();
    expect(db.orders[0].orderDate).toBe("2026-09-21");
    expect(db.orders[0].deliveryDate).toBe("2026-09-21");
  });

  it("sin fecha de entrega, sigue sin fecha (no inventa una)", async () => {
    servidorCon([
      { id: "o1", code: "PED-1", status: "en_preparacion", order_date: "2026-09-21T00:00:00+00:00", delivery_date: null, total: 0 },
    ]);
    const db = await pullDb();
    expect(db.orders[0].deliveryDate).toBeUndefined();
  });

  it("al escribir, orderDate usa el día en Bogotá aunque en UTC ya sea el día siguiente", () => {
    // 23:30 en Bogotá (día 20) es 04:30 UTC del día 21: con la hora UTC habría quedado "21".
    vi.setSystemTime(new Date("2026-09-21T04:30:00Z"));
    const db = emptyDb();
    db.customers.push({ id: "c1", name: "Cliente", isActive: true, createdAt: ahora });
    db.products.push({ id: "p1", sku: "S1", name: "iPhone", price: 100, cost: 50, minStock: 0, isActive: true, createdAt: ahora, updatedAt: ahora });
    const order = createOrder(
      db,
      { id: "u1", email: "b@x.com", fullName: "Bodeguero", role: "bodeguero" },
      { customerId: "c1", lineas: [{ productId: "p1", quantity: 1 }] },
    );
    expect(order.orderDate).toBe("2026-09-20");
    vi.useRealTimers();
  });
});

describe("traducirErrorServidor · duplicado dentro de una recepción", () => {
  it("un choque de duplicado en bodega_reception_items usa el mismo aviso que la validación al escanear (no el genérico de 'otro dispositivo')", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "bodega_reception_items_serial_unico_por_recepcion"',
      },
    });
    const previo = antesDeDespachar();
    const sig = cloneDb(previo);
    sig.receptionItems.push({
      id: "ri1", receptionId: "r1", productId: "p1", serial: "1", condition: "nuevo", createdAt: ahora,
    });
    const clave = await pushDb(previo, sig).then(
      () => "",
      (e: DomainError) => e.key,
    );
    expect(clave).toBe("errors.serialDuplicateInReception");
  });

  it("un duplicado en otra tabla sigue usando el aviso genérico de conflicto", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint "bodega_units_serial_key"' },
    });
    const previo = antesDeDespachar();
    const sig = cloneDb(previo);
    sig.units[0].notes = "cambio cualquiera";
    const clave = await pushDb(previo, sig).then(
      () => "",
      (e: DomainError) => e.key,
    );
    expect(clave).toBe("errors.saveConflict");
  });
});

describe("orden de seriales al recibir o serializar (no por un id interno al azar)", () => {
  it("receptionItems y orderItemUnits se piden ascendentes por fecha (el más viejo primero); otras colecciones siguen pidiéndose descendentes", async () => {
    const ordenesPedidos: Record<string, unknown[]> = {};
    mocks.from.mockImplementation((tabla: string) => {
      const llamadasTabla: unknown[] = [];
      ordenesPedidos[tabla] = llamadasTabla;
      const encadenable = {
        order: (columna: string, opciones: unknown) => {
          llamadasTabla.push({ columna, opciones });
          return encadenable;
        },
        eq: () => encadenable,
        range: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return { select: () => encadenable };
    });

    await pullDb();

    expect(ordenesPedidos["bodega_reception_items"]).toContainEqual({
      columna: "created_at",
      opciones: { ascending: true },
    });
    expect(ordenesPedidos["bodega_order_item_units"]).toContainEqual({
      columna: "created_at",
      opciones: { ascending: true },
    });
    // Una bitácora (que sí quiere lo más nuevo arriba) no cambió: sigue descendente.
    expect(ordenesPedidos["bodega_movements"]).toContainEqual({
      columna: "created_at",
      opciones: { ascending: false },
    });
  });
});
