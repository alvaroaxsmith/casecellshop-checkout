import { ErpService } from "./erp.service";

// Único ponto do código que fala HTTP com o erp-mock de verdade — os testes
// e2e só exercitam o caminho feliz (erp-mock sempre está de pé e sempre
// responde 200) e nunca o erp-mock respondendo com erro. Ambos os métodos
// têm um comportamento documentado especificamente para essa situação
// (falha o boot / trata como falha da tentativa) que hoje não tinha nenhuma
// cobertura automatizada.
describe("ErpService", () => {
  const realFetch = global.fetch;
  let service: ErpService;

  beforeEach(() => {
    service = new ErpService();
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  describe("fetchCatalog", () => {
    it("returns the parsed catalog when erp-mock responds 200", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ products: [{ id: "p1", name: "P", priceCents: 100, stock: 1, imageUrl: "", imageAlt: "" }] }),
      }) as unknown as typeof fetch;

      const catalog = await service.fetchCatalog();

      expect(catalog).toEqual([{ id: "p1", name: "P", priceCents: 100, stock: 1, imageUrl: "", imageAlt: "" }]);
    });

    // This is the failure mode documented in the README as "the backend
    // fails to boot if it can't reach erp-mock" — ProductsModule's factory
    // provider relies on this throwing, not on a fallback empty catalog.
    it("throws when erp-mock responds with a non-ok status, instead of booting with an empty catalog", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;

      await expect(service.fetchCatalog()).rejects.toThrow(/503/);
    });
  });

  describe("call", () => {
    it("returns success:false when erp-mock responds with a non-ok status", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

      await expect(service.call()).resolves.toEqual({ success: false });
    });

    it("returns whatever success flag erp-mock reports on a 200", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }) as unknown as typeof fetch;

      await expect(service.call()).resolves.toEqual({ success: true });
    });
  });
});
