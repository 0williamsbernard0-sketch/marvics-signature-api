import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { TatumAdapter } from '../wallets/adapters/tatum.adapter';
import { LedgerEntryType, WithdrawalStatus, Prisma } from '@prisma/client';

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private walletAdapter: TatumAdapter,
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

    // Audit log this request — same as admin actions already log, but
    // written directly since this isn't triggered through an @Roles() route.
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'WITHDRAWAL_REQUESTED',
        method: 'INTERNAL',
        path: '/withdrawals',
        statusCode: 201,
        requestBody: {
          asset,
          amount: amount.toString(),
          destinationAddress,
        },
        ipAddress: null,
      },
    });

    // FIX (bug #2): instant-tier withdrawals were being created as APPROVED
    // and then never touched again — approve() (which actually broadcasts)
    // only runs for RISK_REVIEW items reached via the admin queue. Instant
    // withdrawals skip that queue entirely, so they need to broadcast right
    // here, immediately after creation, instead of sitting at APPROVED
    // forever with no automated path forward.
    if (!isVerifiedTier) {
      return this.broadcastAndFinalize(withdrawal.id);
    }

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

    await this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });

    return this.broadcastAndFinalize(withdrawalId);
  }

  // FIX (bug #1 + #2): shared broadcast logic used by both the instant-tier
  // path (called directly from requestWithdrawal) and the admin-approved
  // path (called from approve). Previously this logic lived only inside
  // approve() and its failure branch never refunded the user — it just
  // marked the withdrawal FAILED and left the debit in place. Now both
  // paths get identical, correct behavior: move to BROADCASTING, attempt
  // the broadcast, and on failure, refund the debited amount back to the
  // user's ledger before marking FAILED — mirroring reject()'s refund.
  private async broadcastAndFinalize(withdrawalId: string) {
    const withdrawal = await this.prisma.withdrawalRequest.findUniqueOrThrow({
      where: { id: withdrawalId },
    });

    await this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: { status: WithdrawalStatus.BROADCASTING },
    });

    try {
      const result = await this.walletAdapter.createWithdrawal({
        asset: withdrawal.asset,
        amount: withdrawal.amount.toString(),
        destinationAddress: withdrawal.destinationAddress,
      });

      return await this.prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: {
          status: WithdrawalStatus.COMPLETED,
          txHash: result.txHash,
        },
      });
    } catch (err: any) {
      // Refund: the debit happened at request time, but the broadcast never
      // went through, so the user must get their balance back — otherwise
      // funds are stuck debited with no way to recover them.
      await this.ledger.postEntry({
        userId: withdrawal.userId,
        asset: withdrawal.asset,
        amount: withdrawal.amount.toString(), // positive = credit back
        entryType: LedgerEntryType.ADMIN_ADJUSTMENT,
        referenceType: 'withdrawal_broadcast_failure',
        referenceId: withdrawal.id,
        createdBy: withdrawal.reviewedBy ?? withdrawal.userId,
      });

      const failed = await this.prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: { status: WithdrawalStatus.FAILED },
      });

      this.logger.error(`Withdrawal broadcast failed for ${withdrawalId}, refunded user: ${err}`);
      return failed;
    }
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