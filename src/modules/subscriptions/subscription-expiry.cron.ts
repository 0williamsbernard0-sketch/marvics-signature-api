// src/modules/subscriptions/subscription-expiry.cron.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionExpiryCron {
  private readonly logger = new Logger(SubscriptionExpiryCron.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleExpirations() {
    const now = new Date();

    const expiredTelegram = await this.prisma.subscription.findMany({
      where: { telegramActive: true, telegramExpiresAt: { lt: now } },
    });

    for (const sub of expiredTelegram) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { telegramActive: false },
      });
      if (sub.telegramUserId) {
        await this.removeFromTelegram(sub.telegramUserId);
      }
      this.logger.log(`Deactivated Telegram access for subscription ${sub.id}`);
    }

    await this.prisma.subscription.updateMany({
      where: { signalActive: true, signalExpiresAt: { lt: now } },
      data: { signalActive: false },
    });
  }

  private async removeFromTelegram(telegramUserId: string) {
    const botToken = this.config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    const chatId = this.config.getOrThrow<string>('TELEGRAM_CHAT_ID');

    await fetch(`https://api.telegram.org/bot${botToken}/banChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, user_id: telegramUserId }),
    });
    // Immediately unban so they COULD rejoin later if they resubscribe —
    // banChatMember alone would permanently block them from ever returning.
    await fetch(`https://api.telegram.org/bot${botToken}/unbanChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, user_id: telegramUserId }),
    });
  }
}
