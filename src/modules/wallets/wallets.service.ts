import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TatumAdapter } from './adapters/tatum.adapter';
import { LedgerService } from '../ledger/ledger.service';
import { ReferralsService } from '../referrals/referrals.service';
import { LedgerEntryType, DepositStatus } from '@prisma/client';

// NOTE (handoff addendum v3 §4, resolved): this map is no longer used to
// gate Tatum deposits — Tatum's webhook only fires after ITS OWN internal
// confirmation threshold is met, and never sends a confirmations count, so
// there's nothing here for us to compare against. Confirmed against a real
// captured payload. Kept in case a future, different wallet adapter reports
// real escalating confirmation counts and needs this threshold again.
const REQUIRED_CONFIRMATIONS: Record<string, number> = {
  BTC: 2,
  ETH: 12,
};

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    private prisma: PrismaService,
    private walletAdapter: TatumAdapter,
    private ledger: LedgerService,
    private referrals: ReferralsService,
  ) {}

  // Idempotent: returns the existing address if {userId, chain, asset}
  // already has one (DepositAddress has @@unique([userId, chain, asset])
  // in schema.prisma), otherwise calls the adapter to generate a new one.
  async getOrCreateAddress(userId: string, chain: string, asset: string) {
    const existing = await this.prisma.depositAddress.findUnique({
      where: { userId_chain_asset: { userId, chain, asset } },
    });
    if (existing) {
      return existing;
    }

    const result = await this.walletAdapter.createDepositAddress(userId, chain, asset);

    try {
      return await this.prisma.depositAddress.create({
        data: {
          userId,
          chain,
          asset,
          address: result.address,
          providerRef: result.providerRef,
        },
      });
    } catch (err: any) {
      // If persistence fails after Tatum already succeeded (subscription
      // created, address derived), don't leave the caller with a thrown
      // error and an orphaned Tatum subscription. Re-check: another
      // concurrent call, or a previous partial failure, may have already
      // saved this exact row.
      const recovered = await this.prisma.depositAddress.findUnique({
        where: { userId_chain_asset: { userId, chain, asset } },
      });
      if (recovered) {
        this.logger.warn(
          `depositAddress.create failed for ${userId}/${chain}/${asset} but a row already exists — recovering.`,
        );
        return recovered;
      }
      // Genuinely unrecoverable — surface the real error.
      this.logger.error(
        `Failed to persist DepositAddress for ${userId}/${chain}/${asset} after Tatum succeeded: ${err}`,
      );
      throw err;
    }
  }

  async listAddresses(userId: string) {
    return this.prisma.depositAddress.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async handleWebhook(rawPayload: unknown, signatureHeader: string) {
    const event = await this.walletAdapter.handleWebhook(rawPayload, signatureHeader);

    const address = await this.prisma.depositAddress.findUnique({
      where: { address: event.address },
    });
    if (!address) {
      this.logger.warn(`Webhook for unknown address ${event.address} — ignoring`);
      return null;
    }

    // Idempotency: DepositEvent has @@unique([txHash, chain]) in schema.prisma.
    const existing = await this.prisma.depositEvent.findUnique({
      where: { txHash_chain: { txHash: event.txHash, chain: event.chain } },
    });

    // First time we've seen this tx: Tatum only calls this webhook after its
    // own confirmation threshold is already satisfied (see note above), so
    // receipt of the webhook IS the confirmation signal — credit immediately,
    // there's no sub-threshold "pending" state to wait through anymore.
    if (!existing) {
      const depositEvent = await this.prisma.depositEvent.create({
        data: {
          depositAddressId: address.id,
          txHash: event.txHash,
          chain: event.chain,
          asset: event.asset,
          amount: event.amount,
          confirmations: event.confirmations, // informational only now
          status: DepositStatus.CONFIRMED,
          rawWebhookPayload: event.rawPayload as any,
        },
      });

      return this.creditDeposit(depositEvent, address.userId, event.asset, event.amount);
    }

    // We've seen this tx before. If it's already credited, this is a genuine
    // no-op — never credit the same tx twice.
    if (existing.status === DepositStatus.CREDITED) {
      this.logger.log(`Duplicate webhook for already-credited tx ${event.txHash} — no-op`);
      return existing;
    }

    // Existing record that isn't credited yet (e.g. one created before this
    // fix, still stuck at PENDING) — credit it now.
    return this.creditDeposit(existing, address.userId, event.asset, event.amount);
  }

  private async creditDeposit(
    depositEvent: { id: string },
    userId: string,
    asset: string,
    amount: string,
  ) {
    const ledgerEntry = await this.ledger.postEntry({
      userId,
      asset,
      amount, // positive = credit
      entryType: LedgerEntryType.DEPOSIT,
      referenceType: 'deposit_event',
      referenceId: depositEvent.id,
    });

    const updated = await this.prisma.depositEvent.update({
      where: { id: depositEvent.id },
      data: { status: DepositStatus.CREDITED, ledgerEntryId: ledgerEntry.id },
    });

    // Referral trigger — idempotent via ReferralReward's unique constraint,
    // safe even if this deposit path is ever hit twice for the same user.
    // Fire-and-forget-safe: a failure here should never block a real credit.
    try {
      await this.referrals.triggerReward(userId, 'first_deposit');
    } catch (err) {
      this.logger.error(`Referral trigger failed for user ${userId}: ${err}`);
    }

    return updated;
  }

  async listDeposits(userId: string) {
    return this.prisma.depositEvent.findMany({
      where: { depositAddress: { userId } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
