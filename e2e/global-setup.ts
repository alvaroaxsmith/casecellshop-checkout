import { execSync } from "child_process";

// A suíte usa um DB lógico do Redis isolado (ver REDIS_URL no webServer do
// backend em playwright.config.ts) — dedicado a esta suíte, separado do "0"
// usado por "npm run dev" e do "1" usado pelos testes e2e do backend
// (backend/test/global-setup.ts). Sem isso, os testes assumiriam estoque
// "de fábrica" (10/5/1) que só é verdade na primeira execução — o Redis, ao
// contrário do Map em memória de main, lembra o estoque entre execuções.
export default async function globalSetup(): Promise<void> {
  execSync("redis-cli -n 2 flushdb", { stdio: "ignore" });
}
