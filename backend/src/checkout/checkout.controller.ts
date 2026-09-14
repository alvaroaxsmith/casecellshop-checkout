import { Body, Controller, Headers, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CheckoutService } from "./checkout.service";
import { CheckoutDto, CheckoutAcceptedResponseDto } from "./checkout.dto";
import { ErrorResponseDto } from "../common/dto/error-response.dto";

@ApiTags("checkout")
@Controller("checkout")
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary: "Inicia uma tentativa de compra",
    description:
      "Reserva o estoque como uma operação síncrona e indivisível, responde imediatamente com o pedido em pending, e liquida com o ERP em segundo plano (com timeout, retry e backoff). Reenviar a mesma Idempotency-Key retorna a resposta original sem reprocessar nada.",
  })
  @ApiHeader({
    name: "Idempotency-Key",
    required: false,
    description: "Alternativa a enviar idempotencyKey no corpo da requisição.",
  })
  @ApiAcceptedResponse({
    type: CheckoutAcceptedResponseDto,
    description: "Pedido aceito: estoque já reservado, liquidação com o ERP em andamento em segundo plano.",
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: "Payload inválido (productId, quantity ou idempotencyKey ausente/incorreto)." })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: "productId não corresponde a um produto existente." })
  @ApiConflictResponse({ type: ErrorResponseDto, description: "Estoque insuficiente para a quantidade pedida." })
  checkout(@Body() dto: CheckoutDto, @Req() req: Request, @Headers("Idempotency-Key") headerKey?: string) {
    return this.checkoutService.checkout(dto, headerKey, req.id);
  }
}
