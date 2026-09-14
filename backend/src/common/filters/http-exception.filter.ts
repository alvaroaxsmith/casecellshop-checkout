import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const reqCtx = `requestId=${request.id ?? "-"} method=${request.method} path=${request.originalUrl}`;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as { error?: { code?: string; message?: string } };
      this.logger.warn(
        `Requisição rejeitada — status=${status} errorCode=${body.error?.code ?? "-"} errorMessage="${body.error?.message ?? exception.message}" ${reqCtx}`,
      );
      response.status(status).json(exception.getResponse());
      return;
    }

    this.logger.error(
      `Exceção não tratada, respondendo 500 — ${reqCtx}`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: "INTERNAL_ERROR", message: "Ocorreu um erro inesperado. Tente novamente." },
    });
  }
}
