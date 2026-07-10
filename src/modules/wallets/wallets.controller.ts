import { Controller, Get, Post, Body, Headers, Req, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';  // see note below
// ...existing imports...

@Controller('wallets')
export class WalletsController {
  // ...existing constructor, createAddress, listAddresses (keep @UseGuards(JwtAuthGuard) on those individually now, not at class level)...
}

// Separate controller, not nested under /wallets, per Doc 4 §4 route table:
@Controller('webhooks')
export class WebhooksController {
  constructor(private walletsService: WalletsService) {}

  @Public()
  @Post('tatum')
  async tatumWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-payload-hash') signature: string,
  ) {
    return this.walletsService.handleWebhook(req.rawBody, signature);
  }
}
