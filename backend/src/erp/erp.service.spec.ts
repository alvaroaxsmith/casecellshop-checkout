import { ErpService } from "./erp.service";

// Único ponto do código que fala HTTP com o erp-mock de verdade. call()'s
// caminho de erro (ERP_SIM_MODE=always-http-error/always-reset) já é
// exercitado contra o erp-mock rodando de verdade em
// backend/test/checkout.e2e-spec.ts — os testes abaixo continuam existindo
// porque cobrem o mesmo comportamento de forma mais rápida e isolada, sem
// depender de um processo HTTP real de pé. fetchCatalog() é diferente: só
// falha uma vez, no boot do módulo, então não há um cenário e2e razoável
// pra provocar isso contra o erp-mock real — aqui continua sendo a única
// cobertura que existe para esse caminho.
describe("ErpService", () => {
  const realFetch = global.fetch;
  let service: ErpService;

  beforeEach(() => {
    service = new ErpService();
  });

  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.ERP_SIM_DELAY_MS;
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

    it("forwards ERP_SIM_DELAY_MS as the X-Erp-Simulate-Delay-Ms header when set", async () => {
      process.env.ERP_SIM_DELAY_MS = "250";
      const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
      global.fetch = fetchMock as unknown as typeof fetch;

      await service.call();

      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Record<string, string>)["X-Erp-Simulate-Delay-Ms"]).toBe("250");
    });
  });
});
