import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TradingService } from './trading.service';
import { OrderSide } from '@prisma/client';

interface AuthenticatedUser {
  id: string;
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class TradingController {
  constructor(private tradingService: TradingService) {}

  @Post()
  async placeOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { side: OrderSide; symbol: string; quantity: string },
  ) {
    return this.tradingService.placeOrder(user.id, body.side, body.symbol, body.quantity);
  }

  @Get()
  async listOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.tradingService.listOrders(user.id);
  }
}