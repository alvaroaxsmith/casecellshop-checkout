import { test, expect } from "@playwright/test";

test.describe("Checkout", () => {
  test("realiza a compra com sucesso e atualiza o estoque exibido", async ({ page }) => {
    await page.goto("/");

    const card = page.locator('label:has(input[value="capinha-transparente"])');
    await expect(card).toContainText("10 em estoque");

    await card.click();
    await page.fill("#quantity-input", "1");
    await page.click('button:has-text("Comprar")');

    await expect(page.getByRole("status")).toHaveText("Compra confirmada!", { timeout: 16_000 });
    // a reserva já é feita antes do ERP confirmar, então o estoque exibido
    // cai assim que o pedido é aceito — sem precisar recarregar a página.
    await expect(card).toContainText("9 em estoque");
  });

  test("bloqueia a compra por falta de estoque", async ({ page }) => {
    await page.goto("/");

    // capinha-listrada tem 1 unidade em estoque; pedir 2 numa única tentativa
    // falha na primeira checagem, sem depender de uma corrida entre abas.
    await page.locator('label:has(input[value="capinha-listrada"])').click();
    await page.fill("#quantity-input", "2");
    await page.click('button:has-text("Comprar")');

    await expect(page.getByRole("alert")).toHaveText("Este produto está esgotado no momento.");
  });

  test("mostra falha temporária do ERP e permite tentar novamente com sucesso", async ({ page }) => {
    await page.goto("/");

    await page.locator('label:has(input[value="capinha-preta"])').click();
    await page.fill("#quantity-input", "1");

    // Simula uma indisponibilidade do ERP interceptando a chamada de rede do
    // frontend, sem alterar nenhum código da aplicação: o POST /api/checkout
    // "aceita" o pedido normalmente (o backend real já reservou estoque antes
    // de chamar o ERP), mas o GET /api/orders/:id consultado pelo polling
    // retorna o pedido como falho, como aconteceria se o ERP nunca respondesse.
    await page.route("**/api/checkout", (route) =>
      route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          orderId: "ord_e2e_fake",
          status: "pending",
          statusUrl: "/orders/ord_e2e_fake",
        }),
      }),
    );
    await page.route("**/api/orders/ord_e2e_fake", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          orderId: "ord_e2e_fake",
          status: "failed",
          error: {
            code: "ERP_PROCESSING_FAILED",
            message: "Não conseguimos concluir seu pedido agora. Tente novamente em instantes.",
          },
        }),
      }),
    );

    await page.click('button:has-text("Comprar")');
    await expect(page.getByRole("alert")).toHaveText(
      "Não conseguimos concluir seu pedido agora. Tente novamente em instantes.",
      { timeout: 10_000 },
    );

    // Remove a interceptação ("ERP voltou ao normal") e tenta de novo — desta
    // vez contra o backend real, que deve concluir a compra normalmente.
    await page.unroute("**/api/checkout");
    await page.unroute("**/api/orders/ord_e2e_fake");
    await page.click('button:has-text("Comprar")');

    await expect(page.getByRole("status")).toHaveText("Compra confirmada!", { timeout: 16_000 });
  });
});
