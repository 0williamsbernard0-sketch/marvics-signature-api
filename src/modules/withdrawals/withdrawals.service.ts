import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerEntryType, WithdrawalStatus, Prisma } from '@prisma/client';

@Injectable()
export class WithdrawalsService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
  ) {}

  private async getSettings() {
    const settings = await this.prisma.withdrawalSettings.findUnique({
      where: { id: 'singleton' },
    });
    // Fail-safe default if the singleton row was never seeded — never assume
    // an unconfigured limit means "unlimited."
    return (
      settings ??
      (await this.prisma.withdrawalSettings.create({
        data: { id: 'singleton' },
      }))
    );
  }

  async requestWithdrawal(
    userId: string,
    asset: string,
    amountStr: string,
    destinationAddress: string,
  ) {
    const settings = await this.getSettings();

    if (settings.paused) {
      throw new ForbiddenException(
        `Withdrawals are currently paused${settings.pausedReason ? `: ${settings.pausedReason}` : ''}`,
      );
    }

    const amount = new Prisma.Decimal(amountStr);

    const balance = await this.ledger.getBalance(userId, asset);
    if (balance.lt(amount)) {
      throw new BadRequestException(`Insufficient ${asset} balance`);
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const isVerifiedTier = amount.gte(settings.instantTierLimit);
    const tier = isVerifiedTier ? 'VERIFIED' : 'INSTANT';

    if (isVerifiedTier && user.kycStatus !== 'VERIFIED') {
      throw new ForbiddenException(
        `This withdrawal amount requires identity verification. Please complete KYC first.`,
      );
    }

    // Rolling 24h volume check, per tier limit.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentWithdrawals = await this.prisma.withdrawalRequest.findMany({
      where: {
        userId,
        asset,
        createdAt: { gte: since },
        status: { notIn: [WithdrawalStatus.REJECTED, WithdrawalStatus.FAILED] },
      },
    });
    const recentTotal = recentWithdrawals.reduce(
      (sum, w) => sum.add(w.amount),
      new Prisma.Decimal(0),
    );
    const dailyLimit = isVerifiedTier ? settings.dailyLimitVerified : settings.dailyLimitInstant;
    if (recentTotal.add(amount).gt(dailyLimit)) {
      throw new BadRequestException(
        `This withdrawal would exceed your 24-hour limit of ${dailyLimit} ${asset}`,
      );
    }

    // Debit immediately on request — funds are committed the moment a
    // withdrawal is accepted, per Doc 8's design. Broadcast status is
    // tracked separately via WithdrawalRequest.status.
    const debit = await this.ledger.postEntry({
      userId,
      asset,
      amount: amount.neg().toString(),
      entryType: LedgerEntryType.WITHDRAWAL,
      referenceType: 'withdrawal_request',
      referenceId: `pending-${Date.now()}`,
    });

    const withdrawal = await this.prisma.withdrawalRequest.create({
      data: {
        userId,
        asset,
        amount,
        destinationAddress,
        tier,
        requiresKyc: isVerifiedTier,
        status: isVerifiedTier ? WithdrawalStatus.RISK_REVIEW : WithdrawalStatus.APPROVED,
        ledgerEntryId: debit.id,
      },
    });

    return withdrawal;
  }

  async listWithdrawals(userId: string) {
    return this.prisma.withdrawalRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- Admin / COMPLIANCE actions ----

  async listPendingReview() {
    return this.prisma.withdrawalRequest.findMany({
      where: { status: WithdrawalStatus.RISK_REVIEW },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { email: true, kycStatus: true } } },
    });
  }

  async approve(withdrawalId: string, adminId: string) {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
    });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.status !== WithdrawalStatus.RISK_REVIEW) {
      throw new BadRequestException(`Cannot approve a withdrawal in status ${withdrawal.status}`);
    }

    return this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: WithdrawalStatus.APPROVED,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });
  }

  async reject(withdrawalId: string, adminId: string, reason: string) {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
    });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.status !== WithdrawalStatus.RISK_REVIEW) {
      throw new BadRequestException(`Cannot reject a withdrawal in status ${withdrawal.status}`);
    }

    // Refund: reverse the original debit.
    await this.ledger.postEntry({
      userId: withdrawal.userId,
      asset: withdrawal.asset,
      amount: withdrawal.amount.toString(), // positive = credit back
      entryType: LedgerEntryType.ADMIN_ADJUSTMENT,
      referenceType: 'withdrawal_rejection',
      referenceId: withdrawal.id,
      createdBy: adminId,
    });

    return this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: WithdrawalStatus.REJECTED,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });
  }

  async complete(withdrawalId: string, adminId: string, txHash: string) {
    const withdrawal = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalId },
    });
    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (withdrawal.status !== WithdrawalStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot complete a withdrawal in status ${withdrawal.status} — must be APPROVED first`,
      );
    }
    return this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: WithdrawalStatus.COMPLETED,
        txHash,
        reviewedBy: withdrawal.reviewedBy ?? adminId,
        reviewedAt: withdrawal.reviewedAt ?? new Date(),
      },
    });
  }
}