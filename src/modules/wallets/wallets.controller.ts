// modules/wallets/wallets.controller.ts
import { Body, Controller, Get, Headers, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WalletsService } from './wallets.service';
import { CreateDepositAddressDto } from './dto/create-deposit-address.dto';

@Controller()
export class WalletsController {
  constructor(private walletsService: WalletsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('wallets/addresses')
  async createAddress(@CurrentUser() user: { id: string }, @Body() dto: CreateDepositAddressDto) {
    return this.walletsService.createOrGetAddress(user.id, dto.chain, dto.asset);
  }

  @UseGuards(JwtAuthGuard)
  @Get('wallets/addresses')
  async listAddresses(@CurrentUser() user: { id: string }) {
    return this.walletsService.listAddresses(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('deposits')
  async listDeposits(@CurrentUser() user: { id: string }) {
    return this.walletsService.listDeposits(user.id);
  }

  // PUBLIC route — Tatum calls this directly. Auth is via HMAC signature,
  // not a JWT guard. Must NOT be behind JwtAuthGuard.
  @Post('webhooks/tatum')
  @HttpCode(200)
  async handleWebhook(@Req() req: Request, @Headers('x-payload-hash') signature: string) {
    // req.rawBody is populated by the rawBody:true option in main.ts (below).
    const rawBody = (req as any).rawBody as Buffer;
    return this.walletsService.handleTatumWebhook(rawBody, signature);
  }
}
