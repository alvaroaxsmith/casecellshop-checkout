import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: "http://localhost:5173",
    video: "on",
    screenshot: "on",
    trace: "on",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev",
      cwd: "../erp-mock",
      port: 4000,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run start:dev",
      cwd: "../backend",
      port: 3001,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ERP_SIM_MODE: "always-success", REDIS_URL: "redis://localhost:6379/2" },
    },
    {
      command: "npm run dev",
      cwd: "../frontend",
      port: 5173,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
