import { ErpService } from "./erp.service";

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
