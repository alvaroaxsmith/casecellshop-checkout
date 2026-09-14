import { ApiProperty } from "@nestjs/swagger";

export class ProductDto {
  @ApiProperty({ example: "capinha-preta" })
  id!: string;

  @ApiProperty({ example: "Capinha Preta Fosca" })
  name!: string;

  @ApiProperty({ example: 3990, description: "Preço em centavos." })
  priceCents!: number;

  @ApiProperty({ example: 5, description: "Estoque disponível para venda (estoque base menos reservas ativas)." })
  stock!: number;

  @ApiProperty({ example: "https://images.unsplash.com/photo-1764053430686-5435fe548fca" })
  imageUrl!: string;

  @ApiProperty({ example: "Capinha preta fosca em detalhe, apoiada sobre a caixa do aparelho" })
  imageAlt!: string;
}

export class ProductListResponseDto {
  @ApiProperty({ type: [ProductDto] })
  products!: ProductDto[];
}
