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
      assets.map(async ({ asset }) => {
        const latest = await this.prisma.ledgerEntry.findFirst({
          where: { userId, asset },
          orderBy: { createdAt: 'desc' },
        });
        return { asset, balance: latest?.balanceAfter ?? '0' };
      }),
    );

    return { balances };
  }
}
