import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
}
bootstrap().catch((err: unknown) => {
  console.error("Failed to start backend:", err);
  process.exit(1);
});
