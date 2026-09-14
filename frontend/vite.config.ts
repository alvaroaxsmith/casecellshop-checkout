import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        // Configurável via env var para permitir uma segunda instância do
        // frontend, em outra porta, apontando para um backend isolado (ver
        // e2e/playwright.erp-lento.config.ts) — o padrão continua o mesmo
        // de sempre quando a variável não é definida.
        target: process.env.VITE_BACKEND_URL || "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./test/setup.ts",
  },
});
