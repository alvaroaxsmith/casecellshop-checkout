export interface ErpOutcome {
  success: boolean;
}

export interface ErpGateway {
  call(): Promise<ErpOutcome>;
}

export const ERP_GATEWAY = Symbol("ERP_GATEWAY");
