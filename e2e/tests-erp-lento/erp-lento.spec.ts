import { test, expect } from "@playwright/test";

test.describe("ERP lento (real, não simulado no navegador)", () => {
  test("o pedido falha depois de esgotar 3 tentativas reais contra um erp-mock que nunca responde a tempo", async ({
    page,
  }) => {
    // Ao contrário do cenário "mostra falha temporária do ERP..." em
    // checkout.spec.ts (que usa page.route para fingir a resposta no
    // navegador), aqui não há nenhuma interceptação de rede: o backend
    // desta suíte (ver playwright.erp-lento.config.ts) está rodando com
    // ERP_SIM_MODE=always-timeout, e o erp-mock real dorme 10s antes de
    // responder — muito mais que o timeout de 3s do backend
    // (Promise.race em checkout.service.ts). As 3 tentativas, portanto,
    // perdem a corrida contra o relógio de verdade, uma por uma.
    await page.goto("/");

    await page.locator('label:has(input[value="capinha-preta"])').click();
    await page.fill("#quantity-input", "1");
    await page.click('button:has-text("Comprar")');

    // Pior caso determinístico: 3 tentativas × 3s de timeout + backoffs de
    // 1s/2s = 12s até o backend marcar o pedido como failed. 20s dá folga
    // suficiente sem se aproximar do limite de 15s de polling do frontend.
    await expect(page.getByRole("alert")).toHaveText(
      "Não conseguimos concluir seu pedido agora. Tente novamente em instantes.",
      { timeout: 20_000 },
    );
  });
});
