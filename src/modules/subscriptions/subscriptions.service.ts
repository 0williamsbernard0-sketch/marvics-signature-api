// src/modules/subscriptions/subscriptions.service.ts
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { PaystackService } from './paystack.service';
import { NowPaymentsService } from './nowpayments.service';
import { PaymentProvider, PaymentStatus, SubscriptionPlan } from '@prisma/client';

const PLAN_CONFIG: Record<SubscriptionPlan, { days: number; usd: number; grants: ('telegram' | 'signal')[] }> = {
  TELEGRAM_2WEEK: { days: 14, usd: 15, grants: ['telegram'] },
  TELEGRAM_1MONTH: { days: 30, usd: 25, grants: ['telegram'] },
  TELEGRAM_3MONTH: { days: 90, usd: 60, grants: ['telegram'] },
  SIGNAL_1MONTH: { days: 30, usd: 40, grants: ['signal'] },
  BUNDLE_1MONTH: { days: 30, usd: 55, grants: ['telegram', 'signal'] },
  BUNDLE_3MONTH: { days: 90, usd: 140, grants: ['telegram', 'signal'] },
};
// ^ Placeholder USD prices — replace with your real pricing before launch.

@Injectable()
export class SubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private paystack: PaystackService,
    private nowPayments: NowPaymentsService,
    private config: ConfigService,
  ) {}

  // Aggregates every Subscription row a user has ever had into a single
  // current-status view. A user can accumulate multiple rows over time
  // (renewals, plan changes), so "active" here means ANY row currently
  // grants that access and hasn't expired -- not just the most recent row.
  async getStatus(userId: string) {
    const now = new Date();
    const subs = await this.prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const telegramActive = subs.some((s) => s.telegramActive && s.telegramExpiresAt && s.telegramExpiresAt > now);
    const signalActive = subs.some((s) => s.signalActive && s.signalExpiresAt && s.signalExpiresAt > now);

    const telegramExpiresAt = subs
      .filter((s) => s.telegramActive && s.telegramExpiresAt && s.telegramExpiresAt > now)
      .reduce<Date | null>((latest, s) => (!latest || s.telegramExpiresAt! > latest ? s.telegramExpiresAt : latest), null);

    const signalExpiresAt = subs
      .filter((s) => s.signalActive && s.signalExpiresAt && s.signalExpiresAt > now)
      .reduce<Date | null>((latest, s) => (!latest || s.signalExpiresAt! > latest ? s.signalExpiresAt : latest), null);

    // Most recent unused invite link, if the user hasn't joined yet.
    const pendingInvite = subs.find((s) => s.telegramInviteLink && !s.telegramInviteUsed);

    return {
      telegramActive,
      telegramExpiresAt,
      signalActive,
      signalExpiresAt,
      telegramInviteLink: pendingInvite?.telegramInviteLink ?? null,
    };
  }

  async initiatePaystackCheckout(userId: string, email: string, plan: SubscriptionPlan) {
    const cfg = PLAN_CONFIG[plan];
    if (!cfg) throw new BadRequestException('Unknown plan');

    // Paystack takes Naira in kobo — real implementation should convert
    // your USD pricing to NGN at checkout time via a live rate, not a
    // hardcoded multiplier. Flagging this as a placeholder.
    const amountKobo = Math.round(cfg.usd * 1500 * 100);
    const reference = `PSK-${userId}-${Date.now()}`;

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        provider: PaymentProvider.PAYSTACK,
        providerRef: reference,
        plan,
        amount: cfg.usd,
        currency: 'NGN',
        status: PaymentStatus.PENDING,
      },
    });

    const { authorization_url } = await this.paystack.initializeTransaction(email, amountKobo, reference);
    return { checkoutUrl: authorization_url, paymentId: payment.id };
  }

  async initiateNowPaymentsCheckout(userId: string, plan: SubscriptionPlan, payCurrency: string) {
    const cfg = PLAN_CONFIG[plan];
    if (!cfg) throw new BadRequestException('Unknown plan');

    const orderId = `NOW-${userId}-${Date.now()}`;
    const invoice = await this.nowPayments.createInvoice(cfg.usd, orderId, payCurrency);

    await this.prisma.payment.create({
      data: {
        userId,
        provider: PaymentProvider.NOWPAYMENTS,
        providerRef: String(invoice.id),
        plan,
        amount: cfg.usd,
        currency: payCurrency.toUpperCase(),
        status: PaymentStatus.PENDING,
      },
    });

    return { invoiceUrl: invoice.invoice_url };
  }

  async handlePaystackWebhook(rawBody: Buffer, signature: string) {
    if (!this.paystack.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid Paystack signature');
    }
    const event = JSON.parse(rawBody.toString('utf8'));
    if (event.event !== 'charge.success') return { received: true };

    const reference = event.data.reference;
    await this.activateFromPayment(PaymentProvider.PAYSTACK, reference, event);
    return { received: true };
  }

  async handleNowPaymentsWebhook(payload: any, signature: string) {
    if (!this.nowPayments.verifyIpnSignature(payload, signature)) {
      throw new UnauthorizedException('Invalid NOWPayments signature');
    }
    if (payload.payment_status !== 'finished' && payload.payment_status !== 'confirmed') {
      return { received: true };
    }
    await this.activateFromPayment(PaymentProvider.NOWPAYMENTS, String(payload.payment_id), payload);
    return { received: true };
  }

  private async activateFromPayment(provider: PaymentProvider, providerRef: string, rawPayload: any) {
    // The idempotency check-and-flip (read payment.status, confirm it's not
    // already CONFIRMED, then write CONFIRMED) is wrapped in a transaction
    // so two near-simultaneous webhook redeliveries for the same payment
    // can't both read "not yet confirmed" before either has written back --
    // Paystack and NOWPayments both retry webhook delivery, so this isn't
    // a hypothetical race.
    const payment = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { provider_providerRef: { provider, providerRef } },
      });
      if (!existing) return null; // unknown reference — ignore, don't throw (webhook retries would loop)
      if (existing.status === PaymentStatus.CONFIRMED) return null; // already processed, idempotent no-op

      return tx.payment.update({
        where: { id: existing.id },
        data: { status: PaymentStatus.CONFIRMED, rawWebhookPayload: rawPayload },
      });
    });

    if (!payment) return;

    const cfg = PLAN_CONFIG[payment.plan];
    const expiresAt = new Date(Date.now() + cfg.days * 24 * 60 * 60 * 1000);
    const grantsTelegram = cfg.grants.includes('telegram');
    const grantsSignal = cfg.grants.includes('signal');

    const sub = await this.prisma.subscription.create({
      data: {
        userId: payment.userId,
        plan: payment.plan,
        telegramActive: grantsTelegram,
        telegramExpiresAt: grantsTelegram ? expiresAt : null,
        signalActive: grantsSignal,
        signalExpiresAt: grantsSignal ? expiresAt : null,
      },
    });

    await this.prisma.payment.update({ where: { id: payment.id }, data: { subscriptionId: sub.id } });

    if (grantsTelegram) {
      await this.generateTelegramInvite(sub.id, payment.userId);
    }
  }

  private async generateTelegramInvite(subscriptionId: string, userId: string) {
    const botToken = this.config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    const chatId = this.config.getOrThrow<string>('TELEGRAM_CHAT_ID');

    const res = await fetch(`https://api.telegram.org/bot${botToken}/createChatInviteLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, member_limit: 1 }),
    });
    const data = await res.json();
    if (!data.ok) return; // log this in real implementation — don't crash the webhook over it

    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { telegramInviteLink: data.result.invite_link },
    });
  }
}