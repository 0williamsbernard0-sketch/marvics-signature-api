import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountStatus, UserRole } from '@prisma/client';
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  async search(query?: string) {
    return this.prisma.user.findMany({
      where: query
        ? {
            OR: [
              { email: { contains: query, mode: 'insensitive' } },
              { displayName: { contains: query, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        kycStatus: true,
        createdAt: true,
      },
    });
  }

  async getDashboardStats() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [
      totalUsers,
      newToday,
      newThisWeek,
      newThisMonth,
      kycGroups,
      depositAgg,
      withdrawalAgg,
      balanceRows,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.user.groupBy({ by: ['kycStatus'], _count: { _all: true } }),
      this.prisma.ledgerEntry.aggregate({
        where: { entryType: 'DEPOSIT' },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { entryType: 'WITHDRAWAL' },
        _sum: { amount: true },
      }),
      // Latest balanceAfter per user+asset, summed by asset — gives total
      // held per asset across all users without double-counting old entries.
      this.prisma.$queryRaw<{ asset: string; total: string }[]>`
        SELECT asset, SUM("balanceAfter") as total FROM (
          SELECT DISTINCT ON ("userId", asset) asset, "balanceAfter"
          FROM "LedgerEntry"
          ORDER BY "userId", asset, "createdAt" DESC
        ) latest
        GROUP BY asset
      `,
    ]);
    const kycBreakdown: Record<string, number> = {};
    for (const group of kycGroups) {
      kycBreakdown[group.kycStatus] = group._count._all;
    }
    return {
      users: {
        total: totalUsers,
        newToday,
        newThisWeek,
        newThisMonth,
      },
      kyc: kycBreakdown,
      wallet: {
        totalDepositVolume: depositAgg._sum.amount?.toString() ?? '0',
        totalWithdrawalVolume: withdrawalAgg._sum.amount
          ? withdrawalAgg._sum.amount.abs().toString()
          : '0',
        balancesByAsset: balanceRows,
      },
      // Not built yet — surfaced honestly rather than showing fake zeros.
      subscriptions: { status: 'coming_soon' },
      signals: { status: 'coming_soon' },
    };
  }

  // Only SUPER_ADMIN may mark an account DELETED — COMPLIANCE can freeze/
  // restrict/reactivate but not permanently delete.
  async updateStatus(userId: string, status: AccountStatus, adminRole: UserRole) {
    if (status === AccountStatus.DELETED && adminRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only SUPER_ADMIN can mark an account as DELETED');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    // Note: there's no statusReason field on User yet, so `reason` isn't
    // persisted on the row itself — but AuditLogInterceptor still captures
    // it in requestBody since this route is @Roles()-guarded, so it's not
    // lost, just not queryable directly on User.
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });
  }
}