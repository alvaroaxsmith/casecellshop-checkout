import { ProductsService } from "./products.service";

describe("ProductsService", () => {
  it("reserves stock only while there is enough available", () => {
    const service = new ProductsService();

    expect(service.reserveStock("ord_1", "capinha-listrada", 1)).toBe(true);
    expect(service.reserveStock("ord_2", "capinha-listrada", 1)).toBe(false);
  });

  it("returns reserved stock to availability on release, without touching the base stock", () => {
    const service = new ProductsService();

    service.reserveStock("ord_1", "capinha-preta", 1);
    expect(service.availableStock("capinha-preta")).toBe(4);

    service.releaseReservation("ord_1");
    expect(service.availableStock("capinha-preta")).toBe(5);
  });

  it("permanently deducts stock on confirmation", () => {
    const service = new ProductsService();

    service.reserveStock("ord_1", "capinha-preta", 1);
    service.confirmReservation("ord_1");

    expect(service.availableStock("capinha-preta")).toBe(4);
  });

  it("does not double-deduct stock when confirmReservation is called twice for the same order", () => {
    const service = new ProductsService();

    service.reserveStock("ord_1", "capinha-preta", 1);
    service.confirmReservation("ord_1");
    service.confirmReservation("ord_1");

    expect(service.availableStock("capinha-preta")).toBe(4);
  });
});
