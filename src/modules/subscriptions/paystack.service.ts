// src/modules/subscriptions/paystack.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PaystackService {
  private readonly secretKey: string;

  constructor(private config: ConfigService) {
    this.secretKey = this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
  }

  async initializeTransaction(email: string, amountKobo: number, reference: string, callbackUrl: string) {
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, amount: amountKobo, reference, callback_url: callbackUrl }),
    });
    const data = await res.json();
    if (!res.ok || !data.status) {
      throw new Error(`Paystack init failed: ${JSON.stringify(data)}`);
    }
    return data.data; // { authorization_url, reference, access_code }
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) return false;
    const crypto = require('crypto');
    const hash = crypto.createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    return hash === signatureHeader;
  }
}
