import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from "class-validator";

export class CheckoutDto {
  @ApiProperty({ example: "capinha-preta", description: "Id do produto a comprar." })
  @IsString({ message: "productId é obrigatório." })
  @IsNotEmpty({ message: "productId é obrigatório." })
  productId!: string;

  @ApiProperty({ example: 1, description: "Quantidade desejada; deve ser um inteiro positivo." })
  @IsInt({ message: "A quantidade deve ser maior que zero." })
  @IsPositive({ message: "A quantidade deve ser maior que zero." })
  quantity!: number;

  @ApiPropertyOptional({
    example: "9b1e2c3a-6f2e-4a3a-9c1a-3e2b1c4d5e6f",
    description: "Chave de idempotência — alternativa a enviá-la no header Idempotency-Key.",
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class CheckoutAcceptedResponseDto {
  @ApiProperty({ example: "ord_000001" })
  orderId!: string;

  @ApiProperty({ example: "pending", enum: ["pending"] })
  status!: "pending";

  @ApiProperty({ example: "/orders/ord_000001" })
  statusUrl!: string;
}
