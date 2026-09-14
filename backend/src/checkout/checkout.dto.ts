import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from "class-validator";

export class CheckoutDto {
  @IsString({ message: "productId é obrigatório." })
  @IsNotEmpty({ message: "productId é obrigatório." })
  productId!: string;

  @IsInt({ message: "A quantidade deve ser maior que zero." })
  @IsPositive({ message: "A quantidade deve ser maior que zero." })
  quantity!: number;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
