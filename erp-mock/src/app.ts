import express, { Request, Response } from "express";

type SimulateMode = "always-success" | "always-fail" | "always-timeout" | "random";

// Catálogo do ERP: produto, preço e estoque contábil são dados de propriedade
// do ERP, não da loja — a loja só lê essa base (nunca escreve aqui). Estoque
// aqui é o total contábil "de fábrica"; a disponibilidade real para venda
// (descontando reservas ativas) é calculada e mantida pela loja mesmo assim,
// para nunca depender de uma escrita síncrona no ERP durante um checkout.
const catalog = [
  {
    id: "capinha-preta",
    name: "Capinha Preta Fosca",
    priceCents: 3990,
    stock: 5,
    imageUrl: "https://images.unsplash.com/photo-1764053430686-5435fe548fca",
    imageAlt: "Capinha preta fosca em detalhe, apoiada sobre a caixa do aparelho",
  },
  {
    id: "capinha-transparente",
    name: "Capinha Transparente",
    priceCents: 2990,
    stock: 10,
    imageUrl: "https://images.unsplash.com/photo-1771142061210-95e97225641e",
    imageAlt: "Capinha transparente em detalhe, com o círculo de carregamento magnético",
  },
  {
    id: "capinha-listrada",
    name: "Capinha Listrada",
    priceCents: 3490,
    stock: 1,
    imageUrl: "https://images.unsplash.com/photo-1632045902634-1e8a46c54190",
    imageAlt: "Capinha com listras amarelas e brancas, fotografada de cima sob luz dramática",
  },
];

export const app = express();
app.use(express.json());

app.get("/erp/products", (_req: Request, res: Response) => {
  res.json({ products: catalog });
});

app.post("/erp/orders", async (req: Request, res: Response) => {
  const mode = (req.header("X-Erp-Simulate-Mode") as SimulateMode | undefined) ?? "random";
  const delayHeader = req.header("X-Erp-Simulate-Delay-Ms");

  if (mode === "always-timeout") {
    await sleep(delayHeader ? Number(delayHeader) : 10_000);
    res.json({ success: true });
    return;
  }

  await sleep(delayHeader ? Number(delayHeader) : randomBetween(500, 4000));

  if (mode === "always-success") {
    res.json({ success: true });
    return;
  }
  if (mode === "always-fail") {
    res.json({ success: false });
    return;
  }
  res.json({ success: Math.random() < 0.8 });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
