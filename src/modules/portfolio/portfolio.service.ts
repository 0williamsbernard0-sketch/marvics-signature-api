import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
@Injectable()
export class PortfolioService {
  constructor(private prisma: PrismaService) {}
  // Portfolio is derived, never stored — this is the read path for the
  // project's core rule that balances only exist as replayable ledger state.
  async getPortfolio(userId: string) {
    const assets = await this.prisma.ledgerEntry.groupBy({
      by: ['asset'],
      where: { userId },
    });
    const balances = await Promise.all(
      assets.map(async ({ asset }: { asset: string }) => {
        const latest = await this.prisma.ledgerEntry.findFirst({
          where: { userId, asset },
          orderBy: { createdAt: 'desc' },
        });
        return { asset, balance: latest?.balanceAfter ?? '0' };
      }),
    );
    return { balances };
  }
  async getRecentActivity(userId: string, limit = 10) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        asset: true,
        amount: true,
        entryType: true,
        createdAt: true,
      },
    });
    return entries.map((e) => ({
      id: e.id,
      asset: e.asset,
      amount: e.amount.toString(),
      type: e.entryType,
      createdAt: e.createdAt,
    }));
  }
}