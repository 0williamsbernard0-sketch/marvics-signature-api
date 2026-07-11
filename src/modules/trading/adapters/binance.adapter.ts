import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  ExchangeAdapter,
  PlaceOrderParams,
  OrderResult,
  SymbolInfo,
} from './exchange-adapter.interface';

@Injectable()
export class BinanceAdapter implements ExchangeAdapter {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.getOrThrow<string>('BINANCE_API_KEY');
    this.apiSecret = this.configService.getOrThrow<string>('BINANCE_API_SECRET');
    this.baseUrl = this.configService.getOrThrow<string>('BINANCE_BASE_URL');
  }

  // Binance v3 signing rule: HMAC_SHA256(secret, queryString), appended as
  // a `signature` param. Every signed request needs a `timestamp` param.
  private sign(queryString: string): string {
    return crypto.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
  }

  private async signedRequest<T>(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string>,
  ): Promise<T> {
    const query = new URLSearchParams({
      ...params,
      timestamp: Date.now().toString(),
      recvWindow: '5000',
    });
    const signature = this.sign(query.toString());
    query.append('signature', signature);

    const url = `${this.baseUrl}${path}?${query.toString()}`;
    const res = await fetch(url, {
      method,
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });

    const rawText = await res.text();
    console.log('BINANCE RAW RESPONSE:', res.status, rawText.slice(0, 1000)); // temporary debug log

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new InternalServerErrorException(
        `Binance returned a non-JSON response (HTTP ${res.status}). First 300 chars: ${rawText.slice(0, 300)}`,
      );
    }

    if (parsed.code && parsed.code < 0) {
      throw new InternalServerErrorException(`Binance error ${parsed.code}: ${parsed.msg}`);
    }

    return parsed as T;
  }

  async placeOrder(params: PlaceOrderParams): Promise<OrderResult> {
    const result = await this.signedRequest<{
      orderId: number;
      status: string;
      executedQty: string;
      cummulativeQuoteQty: string;
      fills: Array<{ price: string; qty: string; commission: string; commissionAsset: string }>;
    }>('POST', '/api/v3/order', {
      symbol: params.symbol,
      side: params.side,
      type: 'MARKET',
      quantity: params.quantity,
    });

    const avgPrice =
      result.fills && result.fills.length > 0
        ? (
            result.fills.reduce((sum, f) => sum + parseFloat(f.price) * parseFloat(f.qty), 0) /
            parseFloat(result.executedQty)
          ).toString()
        : undefined;

    const totalFees =
      result.fills && result.fills.length > 0
        ? result.fills.reduce((sum, f) => sum + parseFloat(f.commission), 0).toString()
        : undefined;

    return {
      exchangeOrderId: result.orderId.toString(),
      status: this.mapStatus(result.status),
      filledQty: result.executedQty,
      filledPrice: avgPrice,
      fees: totalFees,
      feeAsset: result.fills?.[0]?.commissionAsset,
      rawResponse: result,
    };
  }

  async getOrderStatus(exchangeOrderId: string, symbol: string): Promise<OrderResult> {
    const result = await this.signedRequest<{
      orderId: number;
      status: string;
      executedQty: string;
      price: string;
    }>('GET', '/api/v3/order', { symbol, orderId: exchangeOrderId });

    return {
      exchangeOrderId: result.orderId.toString(),
      status: this.mapStatus(result.status),
      filledQty: result.executedQty,
      filledPrice: result.price,
      rawResponse: result,
    };
  }

  async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    const res = await fetch(`${this.baseUrl}/api/v3/exchangeInfo?symbol=${symbol}`);
    const rawText = await res.text();

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new InternalServerErrorException(
        `Binance returned a non-JSON response for exchangeInfo (HTTP ${res.status}): ${rawText.slice(0, 300)}`,
      );
    }

    const info = parsed.symbols?.[0];
    if (!info) {
      throw new InternalServerErrorException(`Unknown Binance symbol: ${symbol}`);
    }

    const lotSize = info.filters.find((f: any) => f.filterType === 'LOT_SIZE');
    const notional = info.filters.find((f: any) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL');

    return {
      symbol: info.symbol,
      minQty: lotSize?.minQty ?? '0',
      qtyStep: lotSize?.stepSize ?? '0',
      minNotional: notional?.minNotional ?? '0',
    };
  }

  private mapStatus(binanceStatus: string): OrderResult['status'] {
    switch (binanceStatus) {
      case 'FILLED':
        return 'FILLED';
      case 'PARTIALLY_FILLED':
        return 'PARTIALLY_FILLED';
      case 'NEW':
      case 'PENDING_NEW':
        return 'SUBMITTED';
      case 'CANCELED':
      case 'EXPIRED':
        return 'CANCELLED';
      case 'REJECTED':
        return 'FAILED';
      default:
        return 'SUBMITTED';
    }
  }
}