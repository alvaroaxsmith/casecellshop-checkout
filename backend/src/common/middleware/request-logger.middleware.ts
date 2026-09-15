import { randomUUID } from "node:crypto";
import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP");

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = (req.headers["x-request-id"] as string | undefined) || randomUUID().slice(0, 8);
    req.id = requestId;
    res.setHeader("X-Request-Id", requestId);

    const start = process.hrtime.bigint();
    this.logger.log(`--> ${req.method} ${req.originalUrl} requestId=${requestId} ip=${req.ip}`);

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const line = `<-- ${req.method} ${req.originalUrl} requestId=${requestId} status=${res.statusCode} durationMs=${durationMs.toFixed(1)}`;
      if (res.statusCode >= 500) this.logger.error(line);
      else if (res.statusCode >= 400) this.logger.warn(line);
      else this.logger.log(line);
    });

    next();
  }
}
