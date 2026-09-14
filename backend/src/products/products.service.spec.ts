import { ProductsService } from "./products.service";
import { RedisService } from "../redis/redis.service";
import { ErpService, ErpProduct } from "../erp/erp.service";

// Estes deixam de ser testes unitários puros (fakes em memória) e passam a
// rodar contra um Redis real, num banco lógico dedicado a teste — a
// atomicidade do script Lua de reserveStock não dá pra simular com
// fidelidade num fake sem reimplementar o próprio Redis. Requer
// `docker compose up -d redis` (ou um redis-server local) antes de rodar.
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/1";

function testCatalog(): ErpProduct[] {
  return [
    { id: "capinha-preta", name: "Capinha Preta Fosca", priceCents: 3990, stock: 5, imageUrl: "", imageAlt: "" },
    { id: "capinha-transparente", name: "Capinha Transparente", priceCents: 2990, stock: 10, imageUrl: "", imageAlt: "" },
    { id: "capinha-listrada", name: "Capinha Listrada", priceCents: 3490, stock: 1, imageUrl: "", imageAlt: "" },
  ];
}

describe("ProductsService", () => {
  let redis: RedisService;
  let erp: jest.Mocked<ErpService>;
  let service: ProductsService;

  beforeAll(() => {
    redis = new RedisService();
  });

  afterAll(async () => {
    await redis.onModuleDestroy();
  });

  beforeEach(async () => {
    await redis.client.flushdb();
    erp = { fetchCatalog: jest.fn().mockResolvedValue(testCatalog()) } as unknown as jest.Mocked<ErpService>;
    service = new ProductsService(redis, erp);
    await service.onModuleInit();
  });

  it("reserves stock only while there is enough available", async () => {
    expect(await service.reserveStock("ord_1", "capinha-listrada", 1)).toBe(true);
    expect(await service.reserveStock("ord_2", "capinha-listrada", 1)).toBe(false);
  });

  it("returns reserved stock to availability on release, without touching the base stock", async () => {
    await service.reserveStock("ord_1", "capinha-preta", 1);
    expect(await service.availableStock("capinha-preta")).toBe(4);

    await service.releaseReservation("ord_1");
    expect(await service.availableStock("capinha-preta")).toBe(5);
  });

  it("permanently deducts stock on confirmation", async () => {
    await service.reserveStock("ord_1", "capinha-preta", 1);
    await service.confirmReservation("ord_1");

    expect(await service.availableStock("capinha-preta")).toBe(4);
  });

  it("does not double-deduct stock when confirmReservation is called twice for the same order", async () => {
    await service.reserveStock("ord_1", "capinha-preta", 1);
    await service.confirmReservation("ord_1");
    await service.confirmReservation("ord_1");

    expect(await service.availableStock("capinha-preta")).toBe(4);
  });

  it("lets only one of two concurrent reservations for the last unit succeed", async () => {
    const [a, b] = await Promise.all([
      service.reserveStock("ord_a", "capinha-listrada", 1),
      service.reserveStock("ord_b", "capinha-listrada", 1),
    ]);

    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("does not double-release stock when releaseReservation is called twice for the same order", async () => {
    await service.reserveStock("ord_1", "capinha-preta", 1);
    await service.releaseReservation("ord_1");
    await service.releaseReservation("ord_1");

    expect(await service.availableStock("capinha-preta")).toBe(5);
  });

  it("refuses to reserve stock for a product that does not exist", async () => {
    expect(await service.reserveStock("ord_1", "produto-que-nao-existe", 1)).toBe(false);
  });
});
