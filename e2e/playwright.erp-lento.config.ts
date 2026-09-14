import { defineConfig, devices } from "@playwright/test";

// Config isolada, à parte de playwright.config.ts: aquela sobe o backend
// fixo em ERP_SIM_MODE=always-success (para os cenários de caminho feliz
// ficarem determinísticos) e não dá pra mudar isso por teste, já que
// ERP_SIM_MODE só é lido do process.env do backend, não de um header do
// cliente. Esta config sobe um segundo trio erp-mock/backend/frontend, em
// portas próprias, com o backend em ERP_SIM_MODE=always-timeout — para
// exercitar de verdade o Promise.race do backend perdendo contra o
// erp-mock real, sem nenhum page.route() fingindo a resposta no navegador.
export default defineConfig({
  testDir: "./tests-erp-lento",
  fullyParallel: false,
  workers: 1,
  timeout: 35_000,
  reporter: [["html", { outputFolder: "playwright-report-erp-lento", open: "never" }]],
  outputDir: "test-results-erp-lento",
  use: {
    baseURL: "http://localhost:5174",
    video: "on",
    screenshot: "on",
    trace: "on",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev",
      cwd: "../erp-mock",
      port: 4001,
      env: { PORT: "4001" },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run start:dev",
      cwd: "../backend",
      port: 3002,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PORT: "3002", ERP_MOCK_URL: "http://localhost:4001", ERP_SIM_MODE: "always-timeout" },
    },
    {
      command: "npm run dev -- --port 5174 --strictPort",
      cwd: "../frontend",
      port: 5174,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { VITE_BACKEND_URL: "http://localhost:3002" },
    },
  ],
});
