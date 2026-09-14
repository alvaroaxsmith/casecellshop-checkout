import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";

const logger = new Logger("Bootstrap");

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
  logger.log(`Backend ouvindo na porta ${port} — erpMockUrl=${process.env.ERP_MOCK_URL || "http://localhost:4000"}`);
}
bootstrap().catch((err: unknown) => {
  logger.error("Falha ao iniciar o backend", err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
