import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import Redis from "ioredis";

const ERP_MOCK_TEST_PORT = 4100;
const TEST_REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/1";

export default async function globalSetup(): Promise<void> {
  await waitForRedis(TEST_REDIS_URL);
  process.env.REDIS_URL = TEST_REDIS_URL;

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

// Redis roda como um serviço externo real (docker-compose), não como um
// processo filho que este script consegue subir sozinho — ao contrário do
// erp-mock acima, que é só um `ts-node` local. Usa o DB lógico 1 (`/1`) para
// isolar os dados de teste do DB 0 usado por `npm run start:dev`, e limpa
// esse DB antes de cada execução da suíte.
async function waitForRedis(url: string, attempts = 20): Promise<void> {
  const client = new Redis(url, { lazyConnect: true, retryStrategy: () => null });
  try {
    for (let i = 0; i < attempts; i++) {
      try {
        await client.connect();
        await client.flushdb();
        return;
      } catch {
        await client.disconnect();
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new Error(
      `Não foi possível conectar ao Redis em ${url} — rode "docker compose up -d redis" na raiz do repositório antes de rodar os testes.`,
    );
  } finally {
    client.disconnect();
  }
}

async function waitForHealth(url: string, attempts = 40): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // erp-mock isn't listening yet — keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `erp-mock did not become healthy at ${url} in time — check it starts cleanly with "npm run dev" inside erp-mock/`,
  );
}
