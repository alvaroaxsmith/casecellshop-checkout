import { OrdersService } from "./orders.service";

describe("OrdersService", () => {
  it("creates an order with an incrementing id and pending status", () => {
    const service = new OrdersService();

    const first = service.createOrder("capinha-preta", 1);
    const second = service.createOrder("capinha-preta", 2);

    expect(first).toMatchObject({ id: "ord_000001", productId: "capinha-preta", quantity: 1, status: "pending" });
    expect(second.id).toBe("ord_000002");
  });

  it("returns undefined for an id that was never created", () => {
    const service = new OrdersService();

    expect(service.getOrder("ord_999999")).toBeUndefined();
  });

  it("confirms a pending order", () => {
    const service = new OrdersService();
    const order = service.createOrder("capinha-preta", 1);

    service.markConfirmed(order.id);

    expect(service.getOrder(order.id)?.status).toBe("confirmed");
  });

  it("does not re-confirm an order that already moved past pending", () => {
    const service = new OrdersService();
    const order = service.createOrder("capinha-preta", 1);
    service.markConfirmed(order.id);

    service.markConfirmed(order.id);
    service.markFailed(order.id, "ERP_PROCESSING_FAILED", "should be ignored");

    expect(service.getOrder(order.id)?.status).toBe("confirmed");
  });

  it("marks a pending order as failed with the given error code and message", () => {
    const service = new OrdersService();
    const order = service.createOrder("capinha-preta", 1);

    service.markFailed(order.id, "ERP_PROCESSING_FAILED", "Não conseguimos concluir seu pedido agora.");

    const updated = service.getOrder(order.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.errorCode).toBe("ERP_PROCESSING_FAILED");
    expect(updated?.errorMessage).toBe("Não conseguimos concluir seu pedido agora.");
  });

  it("does not re-fail an order that already moved past pending", () => {
    const service = new OrdersService();
    const order = service.createOrder("capinha-preta", 1);
    service.markFailed(order.id, "ERP_PROCESSING_FAILED", "first failure");

    service.markFailed(order.id, "SOMETHING_ELSE", "should be ignored");

    expect(service.getOrder(order.id)?.errorCode).toBe("ERP_PROCESSING_FAILED");
  });

  it("ignores markConfirmed/markFailed for an order id that does not exist", () => {
    const service = new OrdersService();

    expect(() => service.markConfirmed("ord_999999")).not.toThrow();
    expect(() => service.markFailed("ord_999999", "CODE", "message")).not.toThrow();
  });
});
