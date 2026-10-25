import { describe, expect, it } from "vitest";

import { emptyDb } from "./db";
import { getOrderView } from "./selectors";
import type { Order, OrderStatus } from "./types";
import { getOrderSalesTotal, isEstimatedOrderTotal } from "./order-sales-total";

const createView = (status: OrderStatus, withLines = true) => {
  const db = emptyDb();
  const order: Order = {
    id: "order-1",
    code: "PED-261025-005",
    customerId: "customer-1",
    status,
    orderDate: "2026-10-25",
    total: 5_000_000,
    createdBy: "user-1",
    createdAt: "2026-10-25T00:00:00Z",
    updatedAt: "2026-10-25T00:00:00Z",
  };
  db.orders.push(order);
  if (withLines) {
    db.orderItems.push(
      { id: "line-1", orderId: order.id, productId: "product-1", quantity: 2, unitPrice: 2_500_000, subtotal: 5_000_000 },
      { id: "line-2", orderId: order.id, productId: "product-2", quantity: 1, unitPrice: 300_000, subtotal: 300_000 },
    );
  }
  return getOrderView(db, order.id)!;
};

describe("total de venta del listado de pedidos", () => {
  it("muestra el total real de las líneas de una venta despachada, incluso si el total almacenado está desactualizado", () => {
    const view = createView("despachado");
    expect(getOrderSalesTotal(view)).toBe(5_300_000);
    expect(isEstimatedOrderTotal(view)).toBe(false);
  });

  it("muestra el valor como estimado antes de confirmar la venta", () => {
    for (const status of ["en_preparacion", "preparado"] as const) {
      const view = createView(status);
      expect(getOrderSalesTotal(view)).toBe(5_300_000);
      expect(isEstimatedOrderTotal(view)).toBe(true);
    }
  });

  it("no reporta como venta un pedido cancelado", () => {
    expect(getOrderSalesTotal(createView("cancelado"))).toBeNull();
  });

  it("usa el total guardado como respaldo para pedidos históricos sin líneas", () => {
    expect(getOrderSalesTotal(createView("despachado", false))).toBe(5_000_000);
  });
});
