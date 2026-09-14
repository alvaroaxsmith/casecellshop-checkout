import { INestApplication, ValidationError, ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ValidationFailedException } from "./common/exceptions/app.exception";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const first = errors[0];
        if (!first) return new ValidationFailedException("Dado inválido.", "unknown");
        const message = Object.values(first.constraints ?? {})[0] ?? "Dado inválido.";
        return new ValidationFailedException(message, first.property);
      },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("CaseCellShop — Checkout API")
    .setDescription(
      "Catálogo, checkout com reserva de estoque e liquidação assíncrona com o ERP, e consulta de status de pedido. " +
        "Ver o README do projeto para o raciocínio por trás de cada decisão.",
    )
    .setVersion("1.0")
    .addTag("products", "Catálogo de produtos")
    .addTag("checkout", "Fluxo de compra")
    .addTag("orders", "Consulta de status de pedidos")
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, swaggerDocument);
}
