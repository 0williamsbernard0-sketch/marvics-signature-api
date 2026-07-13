import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerEntryType, RewardStatus, Prisma } from '@prisma/client';

@Injectable()
export class ReferralsService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
  ) {}

  private async getSettings() {
    const settings = await this.prisma.referralSettings.findUnique({ where: { id: 'singleton' } });
    return settings ?? (await this.prisma.referralSettings.create({ data: { id: 'singleton' } }));
  }

  // Called from Wallets/Orders services once a referred user's first
  // deposit or first trade completes. Idempotent via the unique constraint
  // on (referredUserId, triggerEvent) — safe to call more than once.
  async triggerReward(referredUserId: string, triggerEvent: 'first_deposit' | 'first_trade') {
    const referredUser = await this.prisma.user.findUnique({ where: { id: referredUserId } });
    if (!referredUser?.referredByCode) return null; // not a referred signup, nothing to do

    const referrer = await this.prisma.user.findUnique({ where: { referralCode: referredUser.referredByCode } });
    if (!referrer) return null; // dangling/invalid referral code

    const existing = await this.prisma.referralReward.findUnique({
      where: { referredUserId_triggerEvent: { referredUserId, triggerEvent } },
    });
    if (existing) return existing; // already paid, no-op

    const settings = await this.getSettings();
    const amount = triggerEvent === 'first_deposit' ? settings.firstDepositReward : settings.firstTradeReward;

    const credit = await this.ledger.postEntry({
      userId: referrer.id,
      asset: settings.rewardAsset,
      amount: amount.toString(),
      entryType: LedgerEntryType.REFERRAL_REWARD,
      referenceType: 'referral_reward',
      referenceId: referredUserId,
    });

    return this.prisma.referralReward.create({
      data: {
        referrerId: referrer.id,
        referredUserId,
        triggerEvent,
        asset: settings.rewardAsset,
        amount,
        status: RewardStatus.PAID,
        ledgerEntryId: credit.id,
      },
    });
  }

  async getMyReferrals(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const rewards = await this.prisma.referralReward.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      referralCode: user.referralCode,
      totalRewards: rewards.length,
      rewards,
    };
  }

  async getConfig() {
    return this.getSettings();
  }

  async updateConfig(data: Partial<{ firstDepositReward: string; firstTradeReward: string; rewardAsset: string }>) {
    await this.getSettings();
    return this.prisma.referralSettings.update({
      where: { id: 'singleton' },
      data: {
        ...(data.firstDepositReward ? { firstDepositReward: new Prisma.Decimal(data.firstDepositReward) } : {}),
        ...(data.firstTradeReward ? { firstTradeReward: new Prisma.Decimal(data.firstTradeReward) } : {}),
        ...(data.rewardAsset ? { rewardAsset: data.rewardAsset } : {}),
      },
    });
  }
}
