import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis, { Result } from "ioredis";
import * as fs from "fs";
import * as path from "path";

declare module "ioredis" {
  interface RedisCommander<Context> {
    reserveStock(
      stockKey: string,
      reservationsHashKey: string,
      quantity: number,
      ttlSeconds: number,
      orderId: string,
      productId: string,
    ): Result<number, Context>;
    confirmReservation(reservationKey: string, orderId: string): Result<number, Context>;
    releaseReservation(reservationKey: string, orderId: string): Result<number, Context>;
  }
}

function loadLua(filename: string): string {
  return fs.readFileSync(path.join(__dirname, "lua", filename), "utf-8");
}

function redisUrl(): string {
  return process.env.REDIS_URL || "redis://localhost:6379";
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  readonly client: Redis;

  constructor() {
    const url = redisUrl();
    this.client = new Redis(url);

    this.client.defineCommand("reserveStock", { numberOfKeys: 2, lua: loadLua("reserve-stock.lua") });
    this.client.defineCommand("confirmReservation", { numberOfKeys: 1, lua: loadLua("confirm-reservation.lua") });
    this.client.defineCommand("releaseReservation", { numberOfKeys: 1, lua: loadLua("release-reservation.lua") });

    this.client.on("error", (err: Error) => {
      this.logger.error(`Erro na conexão com o Redis — url=${url} error=${err.message}`);
    });
    this.client.on("connect", () => {
      this.logger.log(`Conectado ao Redis — url=${url}`);
    });
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
