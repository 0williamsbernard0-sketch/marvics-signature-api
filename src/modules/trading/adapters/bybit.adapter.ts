import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  ExchangeAdapter,
  PlaceOrderParams,
  OrderResult,
  SymbolInfo,
} from './exchange-adapter.interface';

interface BybitResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
  time: number;
}

@Injectable()
export class BybitAdapter implements ExchangeAdapter {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly recvWindow = '5000';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.getOrThrow<string>('BYBIT_API_KEY');
    this.apiSecret = this.configService.getOrThrow<string>('BYBIT_API_SECRET');
    // Testnet: https://api-testnet.bybit.com | Mainnet: https://api.bybit.com
    this.baseUrl = this.configService.getOrThrow<string>('BYBIT_BASE_URL');
  }

  // ---- signing helpers -----------------------------------------------

  private sign(timestamp: string, payload: string): string {
    // Bybit v5 rule: HMAC_SHA256(secret, timestamp + apiKey + recvWindow + payload)
    // payload = queryString for GET, jsonBodyString for POST
    const raw = `${timestamp}${this.apiKey}${this.recvWindow}${payload}`;
    return crypto.createHmac('sha256', this.apiSecret).update(raw).digest('hex');
  }

  private authHeaders(payload: string) {
    const timestamp = Date.now().toString();
    return {
      'X-BAPI-API-KEY': this.apiKey,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': this.recvWindow,
      'X-BAPI-SIGN': this.sign(timestamp, payload),
      'Content-Type': 'application/json',
    };
  }

  // Shared raw-response handler — always reads as text first, then attempts
  // JSON parsing ourselves. This is deliberate: if Bybit ever returns an
  // HTML error page, a plain-text block message, or a proxy/WAF response
  // instead of JSON (e.g. a geo-restriction page), res.json() throws a
  // useless generic SyntaxError. Reading as text first lets us surface the
  // *actual* content in the error, which is what tells us whether this is
  // an auth problem, a rejected order, or an infra-level block.
  private async parseBybitResponse<T>(res: Response): Promise<BybitResponse<T>> {
    const rawText = await res.text();

    // Temporary debug log — remove once Bybit integration is confirmed stable.
    console.log('BYBIT RAW RESPONSE:', res.status, rawText.slice(0, 1000));

    let parsed: BybitResponse<T>;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new InternalServerErrorException(
        `Bybit returned a non-JSON response (HTTP ${res.status}). ` +
          `First 300 chars: ${rawText.slice(0, 300)}`,
      );
    }
    return parsed;
  }

  private async get<T>(path: string, query: Record<string, string>): Promise<T> {
    const queryString = new URLSearchParams(query).toString();
    const headers = this.authHeaders(queryString);
    const res = await fetch(`${this.baseUrl}${path}?${queryString}`, {
      method: 'GET',
      headers,
    });

    const body = await this.parseBybitResponse<T>(res);
    if (body.retCode !== 0) {
      throw new InternalServerErrorException(
        `Bybit error ${body.retCode}: ${body.retMsg}`,
      );
    }
    return body.result;
  }

  private async post<T>(
    path: string,
    payload: Record<string, unknown>,
  ): Promise<{ result: T; raw: unknown }> {
    const jsonBody = JSON.stringify(payload);
    const headers = this.authHeaders(jsonBody);
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: jsonBody,
    });

    const body = await this.parseBybitResponse<T>(res);
    if (body.retCode !== 0) {
      // Not FAILED-status-worthy at the adapter level — the caller decides how
      // to represent a rejected order. Surfacing the raw Bybit message matters
      // for debugging (e.g. insufficient balance, invalid symbol, bad qty step).
      throw new InternalServerErrorException(
        `Bybit error ${body.retCode}: ${body.retMsg}`,
      );
    }
    return { result: body.result, raw: body };
  }

  // ---- ExchangeAdapter implementation ---------------------------------

  async placeOrder(params: PlaceOrderParams): Promise<OrderResult> {
    const payload = {
      category: 'spot',
      symbol: params.symbol,
      side: params.side === 'BUY' ? 'Buy' : 'Sell',
      orderType: 'Market',
      qty: params.quantity,
    };

    const { result, raw } = await this.post<{ orderId: string; orderLinkId: string }>(
      '/v5/order/create',
      payload,
    );

    // Market orders often report back as filled almost immediately, but Bybit's
    // create-order response doesn't include fill price/qty/fees — those only
    // appear once you query the order. So we immediately follow up with a
    // status check before returning, per Doc 7 ("no rounding up to success").
    return this.getOrderStatus(result.orderId, params.symbol, raw);
  }

  async getOrderStatus(
    exchangeOrderId: string,
    symbol: string,
    createRawResponse?: unknown,
  ): Promise<OrderResult> {
    const result = await this.get<{
      list: Array<{
        orderId: string;
        orderStatus: string;
        cumExecQty: string;
        avgPrice: string;
        cumExecFee: string;
        feeCurrency?: string;
      }>;
    }>('/v5/order/realtime', { category: 'spot', symbol, orderId: exchangeOrderId });

    const order = result.list[0];
    if (!order) {
      throw new InternalServerErrorException(
        `Bybit returned no order data for ${exchangeOrderId}`,
      );
    }

    return {
      exchangeOrderId: order.orderId,
      status: this.mapStatus(order.orderStatus),
      filledQty: order.cumExecQty || undefined,
      filledPrice: order.avgPrice || undefined,
      fees: order.cumExecFee || undefined,
      feeAsset: order.feeCurrency,
      rawResponse: createRawResponse ?? order,
    };
  }

  async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    const result = await this.get<{
      list: Array<{
        symbol: string;
        lotSizeFilter: { basePrecision: string; minOrderQty: string; qtyStep: string };
      }>;
    }>('/v5/market/instruments-info', { category: 'spot', symbol });

    const info = result.list[0];
    if (!info) {
      throw new InternalServerErrorException(`Unknown Bybit symbol: ${symbol}`);
    }

    return {
      symbol: info.symbol,
      minQty: info.lotSizeFilter.minOrderQty,
      qtyStep: info.lotSizeFilter.qtyStep,
      minNotional: '0', // Bybit spot doesn't cleanly expose this — server-side rejection handles too-small orders for now
    };
  }

  // ---- helpers ----------------------------------------------------------

  private mapStatus(bybitStatus: string): OrderResult['status'] {
    switch (bybitStatus) {
      case 'Filled':
        return 'FILLED';
      case 'PartiallyFilled':
        return 'PARTIALLY_FILLED';
      case 'New':
      case 'Created':
      case 'PendingCancel':
        return 'SUBMITTED';
      case 'Cancelled':
        return 'CANCELLED';
      case 'Rejected':
      case 'Deactivated':
        return 'FAILED';
      default:
        return 'SUBMITTED';
    }
  }
}
