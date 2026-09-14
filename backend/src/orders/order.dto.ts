import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ErrorDetailDto } from "../common/dto/error-response.dto";

export class OrderStatusResponseDto {
  @ApiProperty({ example: "ord_000001" })
  orderId!: string;

  @ApiProperty({ example: "confirmed", enum: ["pending", "confirmed", "failed"] })
  status!: "pending" | "confirmed" | "failed";

  @ApiPropertyOptional({ type: ErrorDetailDto, description: 'Presente apenas quando status é "failed".' })
  error?: ErrorDetailDto;
}
