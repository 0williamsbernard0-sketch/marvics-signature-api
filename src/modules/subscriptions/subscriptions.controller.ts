// src/modules/subscriptions/subscriptions.controller.ts
import { Body, Controller, Get, Headers, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private subs: SubscriptionsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMyStatus(@CurrentUser() user: any) {
    return this.subs.getStatus(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('checkout/paystack')
  async paystackCheckout(@CurrentUser() user: any, @Body() dto: CreateCheckoutDto) {
    return this.subs.initiatePaystackCheckout(user.id, user.email, dto.plan);
  }

  @UseGuards(JwtAuthGuard)
  @Post('checkout/nowpayments')
  async nowPaymentsCheckout(@CurrentUser() user: any, @Body() dto: CreateCheckoutDto & { payCurrency: string }) {
    return this.subs.initiateNowPaymentsCheckout(user.id, dto.plan, dto.payCurrency);
  }

  // NOTE: this route needs the raw request body for signature verification —
  // your main.ts needs `bodyParser: false` + a raw-body middleware on this
  // path specifically, same pattern likely already used for the Tatum webhook.
  @Post('webhooks/paystack')
  async paystackWebhook(@Req() req: RawBodyRequest<Request>, @Headers('x-paystack-signature') sig: string) {
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw request body');
    }
    return this.subs.handlePaystackWebhook(req.rawBody, sig);
  }

  @Post('webhooks/nowpayments')
  async nowPaymentsWebhook(@Body() payload: any, @Headers('x-nowpayments-sig') sig: string) {
    return this.subs.handleNowPaymentsWebhook(payload, sig);
  }
}
