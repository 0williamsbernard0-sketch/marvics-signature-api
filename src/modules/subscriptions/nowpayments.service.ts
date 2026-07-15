// src/modules/subscriptions/nowpayments.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class NowPaymentsService {
  private readonly apiKey: string;
  private readonly ipnSecret: string;

  constructor(private config: ConfigService) {
    this.apiKey = this.config.getOrThrow<string>('NOWPAYMENTS_API_KEY');
    this.ipnSecret = this.config.getOrThrow<string>('NOWPAYMENTS_IPN_SECRET');
  }

  async createInvoice(priceUsd: number, orderId: string, payCurrency: string) {
    const res = await fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: priceUsd,
        price_currency: 'usd',
        pay_currency: payCurrency, // 'btc' | 'eth' | 'usdt' | 'usdc'
        order_id: orderId,
        ipn_callback_url: this.config.getOrThrow<string>('NOWPAYMENTS_IPN_URL'),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`NOWPayments invoice failed: ${JSON.stringify(data)}`);
    return data; // { id, invoice_url, ... }
  }

  // NOWPayments IPN signature: HMAC-SHA512 over sorted-key JSON, hex-encoded.
  verifyIpnSignature(payload: Record<string, any>, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) return false;
    const sorted = Object.keys(payload)
      .sort()
      .reduce((acc, key) => ({ ...acc, [key]: payload[key] }), {});
    const hash = crypto.createHmac('sha512', this.ipnSecret).update(JSON.stringify(sorted)).digest('hex');
    return hash === signatureHeader;
  }
}
