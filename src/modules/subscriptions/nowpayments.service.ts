import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class NowPaymentsService {
  private readonly apiKey: string;
  private readonly ipnSecret: string;
  private readonly baseUrl = 'https://api.nowpayments.io/v1';

  constructor(private config: ConfigService) {
    this.apiKey = this.config.getOrThrow<string>('NOWPAYMENTS_API_KEY');
    this.ipnSecret = this.config.getOrThrow<string>('NOWPAYMENTS_IPN_SECRET');
  }

  async createInvoice(amountUsd: number, orderId: string, payCurrency: string) {
    const res = await fetch(`${this.baseUrl}/invoice`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: amountUsd,
        price_currency: 'usd',
        pay_currency: payCurrency,
        order_id: orderId,
        ipn_callback_url: this.config.getOrThrow<string>('NOWPAYMENTS_IPN_CALLBACK_URL'),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new InternalServerErrorException(
        `NOWPayments invoice creation failed: ${data.message ?? JSON.stringify(data)}`,
      );
    }
    return data as { id: number; invoice_url: string };
  }

  // NOWPayments' documented IPN quirk: the signature is HMAC SHA512 of the
  // JSON body with object keys sorted alphabetically -- NOT the raw body as
  // received. A plain JSON.stringify(payload) will usually NOT match, since
  // Node doesn't guarantee alphabetical key order, so keys must be sorted
  // (recursively, for nested objects) before hashing.
  verifyIpnSignature(payload: any, signature: string): boolean {
    const sorted = this.sortObject(payload);
    const hash = crypto.createHmac('sha512', this.ipnSecret).update(JSON.stringify(sorted)).digest('hex');
    return hash === signature;
  }

  private sortObject(obj: any): any {
    if (Array.isArray(obj)) return obj.map((v) => this.sortObject(v));
    if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj)
        .sort()
        .reduce((acc, key) => {
          acc[key] = this.sortObject(obj[key]);
          return acc;
        }, {} as Record<string, any>);
    }
    return obj;
  }
}