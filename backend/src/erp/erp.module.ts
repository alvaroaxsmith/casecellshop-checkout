import { Module } from "@nestjs/common";
import { ERP_GATEWAY } from "./domain/erp-gateway";
import { HttpErpGateway } from "./infrastructure/http-erp.gateway";

@Module({
  providers: [{ provide: ERP_GATEWAY, useClass: HttpErpGateway }],
  exports: [ERP_GATEWAY],
})
export class ErpModule {}
