import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  // Binds a real port once instead of letting supertest open/close an
  // ephemeral listener per request — needed for tests that fire more than a
  // couple of truly concurrent requests against the same server.
  await app.listen(0);
  return app;
}
