import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { CheckoutUseCase } from "./application/checkout.use-case";
import { CheckoutRequestDto } from "./dto/checkout-request.dto";

@Controller("checkout")
export class CheckoutController {
  constructor(private readonly checkoutUseCase: CheckoutUseCase) {}

  @Post()
  @HttpCode(202)
  checkout(@Body() dto: CheckoutRequestDto, @Headers("Idempotency-Key") headerKey?: string) {
    return this.checkoutUseCase.execute(dto, headerKey);
  }
}
