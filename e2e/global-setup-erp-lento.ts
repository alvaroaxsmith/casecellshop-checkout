import { execSync } from "child_process";

// Mesmo motivo do global-setup.ts da suíte principal, mas para o DB lógico
// "3" (ver REDIS_URL no webServer do backend em
// playwright.erp-lento.config.ts) — dedicado a esta suíte isolada, para não
// disputar estado com a suíte principal (DB "2") quando as duas rodam uma
// depois da outra via "npm run test:all".
export default async function globalSetup(): Promise<void> {
  execSync("redis-cli -n 3 flushdb", { stdio: "ignore" });
}
