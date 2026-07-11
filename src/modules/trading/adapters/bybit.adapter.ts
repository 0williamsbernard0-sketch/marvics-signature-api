import { Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ExchangeAdapter,
  PlaceOrderParams,
  OrderResult,
  SymbolInfo,
} from './exchange-adapter.interface';

@Injectable()
export class BybitAdapter implements ExchangeAdapter {
  constructor(private configService: ConfigService) {}

  async placeOrder(params: PlaceOrderParams): Promise<OrderResult> {
    throw new NotImplementedException('Bybit API credentials not yet configured');
  }

  async getOrderStatus(exchangeOrderId: string, symbol: string): Promise<OrderResult> {
    throw new NotImplementedException('Bybit API credentials not yet configured');
  }

  async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    throw new NotImplementedException('Bybit API credentials not yet configured');
  }
}