import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerEntryType, Prisma } from '@prisma/client';

export interface PostEntryParams {
  userId: string;
  asset: string;
  amount: Prisma.Decimal | number | string; // signed: positive = credit, negative = debit
  entryType: LedgerEntryType;
  referenceType: string;
  referenceId: string;
  createdBy?: string; // only set for ADMIN_ADJUSTMENT
}

@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService) {}

  /**
   * The ONLY way any entry gets written to LedgerEntry.
   * No other module/service should ever call prisma.ledgerEntry directly.
   */
    async postEntry(params: PostEntryParams, tx?: Prisma.TransactionClient) {
    const { userId, asset, amount, entryType, referenceType, referenceId, createdBy } = params;

    if (entryType === 'ADMIN_ADJUSTMENT' && !createdBy) {
      throw new BadRequestException('ADMIN_ADJUSTMENT entries require createdBy');
    }

    const run = async (client: Prisma.TransactionClient) => {
      const currentBalance = await this.getBalanceInternal(client, userId, asset);
      const newBalance = currentBalance.plus(new Prisma.Decimal(amount));

      return client.ledgerEntry.create({
        data: {
          userId,
          asset,
          amount: new Prisma.Decimal(amount),
          entryType,
          referenceType,
          referenceId,
          balanceAfter: newBalance,
          createdBy: createdBy ?? null,
        },
      });
    };

    // If a transaction was passed in, run inside it (caller controls atomicity).
    // Otherwise, open our own — same behavior as before for existing callers.
    if (tx) {
      return run(tx);
    }
    return this.prisma.$transaction(run);
  }

  /** Read-only: current balance for a user+asset, derived by replaying ledger entries. */
  async getBalance(userId: string, asset: string, tx?: Prisma.TransactionClient): Promise<Prisma.Decimal> {
    return this.getBalanceInternal(tx ?? this.prisma, userId, asset);
  }

  private async getBalanceInternal(
    client: Prisma.TransactionClient | PrismaService,
    userId: string,
    asset: string,
  ): Promise<Prisma.Decimal> {
    const last = await client.ledgerEntry.findFirst({
      where: { userId, asset },
      orderBy: { createdAt: 'desc' },
    });
    return last ? last.balanceAfter : new Prisma.Decimal(0);
  }

  /** Full history for a user+asset, for audit/reconciliation. */
  async getHistory(userId: string, asset?: string) {
    return this.prisma.ledgerEntry.findMany({
      where: { userId, ...(asset ? { asset } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }
}