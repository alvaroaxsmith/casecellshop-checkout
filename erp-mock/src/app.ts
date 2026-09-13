import express, { Request, Response } from "express";

type SimulateMode = "always-success" | "always-fail" | "always-timeout" | "random";

export const app = express();
app.use(express.json());

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
