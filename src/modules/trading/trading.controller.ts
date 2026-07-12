import { Body, Controller, Get, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TradingService } from './trading.service';
import { CreateOrderDto } from './dto/create-order.dto';

interface AuthenticatedUser {
  id: string;
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class TradingController {
  constructor(private tradingService: TradingService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async placeOrder(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateOrderDto) {
    return this.tradingService.placeOrder(user.id, body.side, body.symbol, body.quantity);
  }

  @Get()
  async listOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.tradingService.listOrders(user.id);
  }
}
