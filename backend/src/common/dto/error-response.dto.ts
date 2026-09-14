import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ErrorDetailDto {
  @ApiProperty({ example: "VALIDATION_ERROR" })
  code!: string;

  @ApiProperty({ example: "A quantidade deve ser maior que zero." })
  message!: string;

  @ApiPropertyOptional({ example: "quantity", description: "Presente apenas em erros de validação." })
  field?: string;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorDetailDto })
  error!: ErrorDetailDto;
}
