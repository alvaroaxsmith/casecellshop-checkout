import { ProductsService, Product } from "./products.service";

function testCatalog(): Product[] {
  return [
    { id: "capinha-preta", name: "Capinha Preta Fosca", priceCents: 3990, stock: 5, imageUrl: "", imageAlt: "" },
    { id: "capinha-transparente", name: "Capinha Transparente", priceCents: 2990, stock: 10, imageUrl: "", imageAlt: "" },
    { id: "capinha-listrada", name: "Capinha Listrada", priceCents: 3490, stock: 1, imageUrl: "", imageAlt: "" },
  ];
}

describe("ProductsService", () => {
  it("reserves stock only while there is enough available", () => {
    const service = new ProductsService(testCatalog());

    expect(service.reserveStock("ord_1", "capinha-listrada", 1)).toBe(true);
    expect(service.reserveStock("ord_2", "capinha-listrada", 1)).toBe(false);
  });

  it("returns reserved stock to availability on release, without touching the base stock", () => {
    const service = new ProductsService(testCatalog());

    service.reserveStock("ord_1", "capinha-preta", 1);
    expect(service.availableStock("capinha-preta")).toBe(4);

    service.releaseReservation("ord_1");
    expect(service.availableStock("capinha-preta")).toBe(5);
  });

  it("permanently deducts stock on confirmation", () => {
    const service = new ProductsService(testCatalog());

    service.reserveStock("ord_1", "capinha-preta", 1);
    service.confirmReservation("ord_1");

    expect(service.availableStock("capinha-preta")).toBe(4);
  });

  it("does not double-deduct stock when confirmReservation is called twice for the same order", () => {
    const service = new ProductsService(testCatalog());

    service.reserveStock("ord_1", "capinha-preta", 1);
    service.confirmReservation("ord_1");
    service.confirmReservation("ord_1");

    expect(service.availableStock("capinha-preta")).toBe(4);
  });

  it("does not double-release stock when releaseReservation is called twice for the same order", () => {
    const service = new ProductsService(testCatalog());

    service.reserveStock("ord_1", "capinha-preta", 1);
    service.releaseReservation("ord_1");
    service.releaseReservation("ord_1");

    expect(service.availableStock("capinha-preta")).toBe(5);
  });

  it("refuses to reserve stock for a product that does not exist", () => {
    const service = new ProductsService(testCatalog());

    expect(service.reserveStock("ord_1", "produto-que-nao-existe", 1)).toBe(false);
  });

  it("expires a reservation on its own once the TTL passes, freeing the stock back up", () => {
    const service = new ProductsService(testCatalog());
    const realNow = Date.now;
    const start = realNow();

    try {
      service.reserveStock("ord_1", "capinha-preta", 1);
      expect(service.availableStock("capinha-preta")).toBe(4);

      Date.now = () => start + 2 * 60 * 1000 + 1;
      expect(service.availableStock("capinha-preta")).toBe(5);
    } finally {
      Date.now = realNow;
    }
  });
});
