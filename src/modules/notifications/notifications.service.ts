import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type NotificationType =
  | 'deposit' | 'withdrawal' | 'trade' | 'kyc'
  | 'referral' | 'support' | 'announcement';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /** Called by other modules (support, wallets, withdrawals, referrals...) — not exposed over HTTP. */
  async create(userId: string, type: NotificationType, title: string, body: string) {
    return this.prisma.notification.create({
      data: { userId, type, title, body },
    });
  }

  async listForUser(userId: string, cursor?: string, limit = 25) {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      // unread-first, then newest-first within each group
      orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
    });

    const hasMore = notifications.length > limit;
    const data = hasMore ? notifications.slice(0, limit) : notifications;
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
  }

  async markRead(userId: string, notificationId: string) {
    // scoped to userId so one user can't mark another user's notification read
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });
  }
}
