import { INestApplication, ValidationError, ValidationPipe } from "@nestjs/common";
import { InvalidInputError } from "./shared/domain/errors/invalid-input.error";
import { HttpExceptionFilter } from "./shared/presentation/filters/http-exception.filter";

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const first = errors[0];
        const message = Object.values(first.constraints ?? {})[0] ?? "Dado inválido.";
        return new InvalidInputError(message, first.property);
      },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
}
