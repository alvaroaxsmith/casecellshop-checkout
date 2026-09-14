import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { CheckoutService } from "./checkout.service";
import { CheckoutDto } from "./checkout.dto";

@Controller("checkout")
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post()
  @HttpCode(202)
  checkout(@Body() dto: CheckoutDto, @Headers("Idempotency-Key") headerKey?: string) {
    return this.checkoutService.checkout(dto, headerKey);
  }
}
