import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BinanceAdapter } from '../trading/adapters/binance.adapter';

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    private prisma: PrismaService,
    private binance: BinanceAdapter,
  ) {}

  // Portfolio is derived, never stored — balances only exist as replayed ledger state.
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

        return {
          asset,
          balance: latest?.balanceAfter?.toString() ?? '0',
        };
      }),
    );

    const STABLECOINS = new Set(['USDT', 'USDC', 'BUSD']);

    const balancesWithUsd = await Promise.all(
      balances.map(async (b) => {
        const amount = parseFloat(b.balance);

        if (STABLECOINS.has(b.asset)) {
          return {
            ...b,
            usdValue: b.balance,
          };
        }

        try {
          const price = await this.binance.getPrice(`${b.asset}USDT`);

          return {
            ...b,
            usdValue: (amount * parseFloat(price)).toFixed(2),
          };
        } catch (err) {
          this.logger.warn(
            `Failed to fetch USD price for ${b.asset}: ${err}`,
          );

          return {
            ...b,
            usdValue: null,
          };
        }
      }),
    );

    const totalUsd = balancesWithUsd.reduce(
      (sum, b) => sum + (b.usdValue ? parseFloat(b.usdValue) : 0),
      0,
    );

    return {
      balances: balancesWithUsd,
      totalUsd: totalUsd.toFixed(2),
    };
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