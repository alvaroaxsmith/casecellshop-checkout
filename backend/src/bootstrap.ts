import { INestApplication, ValidationError, ValidationPipe } from "@nestjs/common";
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
}
