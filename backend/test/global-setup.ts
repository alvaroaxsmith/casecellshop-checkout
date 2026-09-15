import { spawn, ChildProcess } from "child_process";
import * as path from "path";

const ERP_MOCK_TEST_PORT = 4100;

export default async function globalSetup(): Promise<void> {
  const erpMockDir = path.resolve(__dirname, "../../erp-mock");
  const child: ChildProcess = spawn("npx", ["ts-node", "src/main.ts"], {
    cwd: erpMockDir,
    env: { ...process.env, PORT: String(ERP_MOCK_TEST_PORT) },
    stdio: "ignore",
  });

  await waitForHealth(`http://localhost:${ERP_MOCK_TEST_PORT}/health`);

  process.env.ERP_MOCK_URL = `http://localhost:${ERP_MOCK_TEST_PORT}`;
  (globalThis as Record<string, unknown>).__ERP_MOCK_PROCESS__ = child;
}

async function waitForHealth(url: string, attempts = 40): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `erp-mock did not become healthy at ${url} in time — check it starts cleanly with "npm run dev" inside erp-mock/`,
  );
}
