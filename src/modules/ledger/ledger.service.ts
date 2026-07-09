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
  async postEntry(params: PostEntryParams) {
    const { userId, asset, amount, entryType, referenceType, referenceId, createdBy } = params;

    if (entryType === 'ADMIN_ADJUSTMENT' && !createdBy) {
      throw new BadRequestException('ADMIN_ADJUSTMENT entries require createdBy');
    }

    return this.prisma.$transaction(async (tx) => {
      const currentBalance = await this.getBalanceInternal(tx, userId, asset);
      const newBalance = currentBalance.plus(new Prisma.Decimal(amount));

      return tx.ledgerEntry.create({
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
    });
  }

  /** Read-only: current balance for a user+asset, derived by replaying ledger entries. */
  async getBalance(userId: string, asset: string): Promise<Prisma.Decimal> {
    return this.getBalanceInternal(this.prisma, userId, asset);
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