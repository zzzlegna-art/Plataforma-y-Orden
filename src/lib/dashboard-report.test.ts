import { describe, expect, it } from "vitest";

import { buildOperationalReportSheets } from "./dashboard-report";
import type { Db } from "./types";

const fixtureDb = () => ({
  settings: { currency: "COP", companyName: "NEXORA" },
  products: [{ id: "product-1", name: "iPhone de prueba", sku: "IP-001" }],
  units: [{ id: "unit-1", productId: "product-1", serial: "IMEI-001" }],
  users: [{ id: "user-1", fullName: "Administración", email: "admin@nexora.test" }],
  customers: [{ id: "customer-1", name: "Cliente de prueba" }],
  tecnicos: [],
  movements: [
    {
      id: "movement-in",
      productId: "product-1",
      unitId: "unit-1",
      type: "entrada",
      quantity: 2,
      referenceType: "recepcion",
      referenceId: "reception-1",
      notes: "Ingreso de prueba",
      createdBy: "user-1",
      createdAt: "2026-10-05T10:30:00",
    },
    {
      id: "movement-outside",
      productId: "product-1",
      type: "salida",
      quantity: 7,
      referenceType: "manual",
      createdBy: "user-1",
      createdAt: "2026-09-30T10:30:00",
    },
  ],
  receptions: [{
    id: "reception-1",
    code: "REC-001",
    reference: "Proveedor de prueba",
    status: "confirmada",
    receivedAt: "2026-10-05T11:00:00",
    confirmedAt: "2026-10-05T11:15:00",
    createdBy: "user-1",
  }],
  receptionItems: [{
    id: "reception-item-1",
    receptionId: "reception-1",
    productId: "product-1",
    serial: "IMEI-001",
    condition: "nuevo",
    cost: 300,
    createdAt: "2026-10-05T11:00:00",
  }],
  orders: [{
    id: "order-1",
    code: "PED-001",
    customerId: "customer-1",
    status: "despachado",
    orderDate: "2026-10-10",
    total: 500,
    createdBy: "user-1",
    createdAt: "2026-10-10T09:00:00",
    updatedAt: "2026-10-10T10:00:00",
  }],
  orderItems: [{
    id: "order-item-1",
    orderId: "order-1",
    productId: "product-1",
    quantity: 2,
    unitPrice: 250,
    subtotal: 500,
  }],
  warranties: [{
    id: "warranty-1",
    code: "GAR-001",
    unitId: "unit-1",
    productId: "product-1",
    customerId: "customer-1",
    reason: "No enciende",
    status: "entregado",
    resolucion: "reparado",
    costo: 80,
    receivedAt: "2026-10-12",
    resolvedAt: "2026-10-20",
    createdBy: "user-1",
  }],
} as unknown as Db);

describe("reporte operativo en Excel", () => {
  it("crea hojas separadas y filtra todos los detalles por el rango seleccionado", () => {
    const sheets = buildOperationalReportSheets(
      fixtureDb(),
      "2026-10-01",
      "2026-10-31",
      new Date("2026-10-31T18:00:00.000Z"),
    );

    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "Resumen",
      "Movimientos",
      "Recepciones",
      "Pedidos",
      "Garantías",
    ]);

    const resumen = new Map(sheets[0].rows.map(([label, value]) => [String(label), value] as const));
    expect(resumen.get("Movimientos registrados")).toBe(1);
    expect(resumen.get("Entradas (unidades)")).toBe(2);
    expect(resumen.get("Salidas (unidades)")).toBe(0);
    expect(resumen.get("Recepciones registradas")).toBe(1);
    expect(resumen.get("Pedidos registrados")).toBe(1);
    expect(resumen.get("Garantías recibidas")).toBe(1);
    expect(resumen.get("Garantías cerradas")).toBe(1);

    expect(sheets[1].rows).toHaveLength(1);
    expect(sheets[1].rows[0]).toContain("IMEI-001");
    expect(sheets[2].rows[0][1]).toBe("REC-001");
    expect(sheets[3].rows[0][2]).toBe("Cliente de prueba");
    expect(sheets[3].rows[0][6]).toBe(500);
    expect(sheets[4].rows[0][9]).toBe(80);
  });

  it("configura anchos, encabezados congelados y formatos numéricos para el uso diario", () => {
    const sheets = buildOperationalReportSheets(fixtureDb(), "2026-10-01", "2026-10-31");

    for (const sheet of sheets) {
      expect(sheet.freezeRows).toBe(4);
      expect(sheet.columnWidths?.length).toBe(sheet.columns.length);
    }
    expect(sheets[1].numberFormats).toEqual({ 2: "#,##0" });
    expect(sheets[3].wrapColumns).toContain(5);
  });
});
