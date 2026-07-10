import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WalletsService } from './wallets.service';
import { AuthService } from '../auth/auth.service';

@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(
    private walletsService: WalletsService,
    private authService: AuthService,
  ) {}

  @Post('addresses')
  async createAddress(
    @CurrentUser() authUser: { authUserId: string; email: string },
    @Body() body: { chain: string; asset: string },
  ) {
    const user = await this.authService.findOrCreateUser(authUser.authUserId, authUser.email);
    return this.walletsService.getOrCreateAddress(user.id, body.chain, body.asset);
  }

  @Get('addresses')
  async listAddresses(@CurrentUser() authUser: { authUserId: string; email: string }) {
    const user = await this.authService.findOrCreateUser(authUser.authUserId, authUser.email);
    return this.walletsService.listAddresses(user.id);
  }
}