import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TatumAdapter } from './adapters/tatum.adapter';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerEntryType, DepositStatus } from '@prisma/client';

// TODO: move this to a SupportedCoin.requiredConfirmations column
// once that migration lands — hardcoded here so Milestone 2 isn't
// blocked on a schema change.
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
    return this.prisma.depositAddress.create({
      data: {
        userId,
        chain,
        asset,
        address: result.address,
        providerRef: result.providerRef,
      },
    });
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

    // Use our own stored chain code (e.g. "BTC") for the confirmations
    // threshold lookup — Tatum's webhook reports its own network name
    // (e.g. "bitcoin-testnet"), which won't match REQUIRED_CONFIRMATIONS keys.
    const internalChain = address.chain;
    const required = REQUIRED_CONFIRMATIONS[internalChain] ?? 6;

    // Idempotency: DepositEvent has @@unique([txHash, chain]) in schema.prisma.
    const existing = await this.prisma.depositEvent.findUnique({
      where: { txHash_chain: { txHash: event.txHash, chain: event.chain } },
    });

    // First time we've seen this tx: create the PENDING/CONFIRMED record.
    if (!existing) {
      const status: DepositStatus =
        event.confirmations >= required ? DepositStatus.CONFIRMED : DepositStatus.PENDING;

      const depositEvent = await this.prisma.depositEvent.create({
        data: {
          depositAddressId: address.id,
          txHash: event.txHash,
          chain: event.chain,
          asset: event.asset,
          amount: event.amount,
          confirmations: event.confirmations,
          status,
          rawWebhookPayload: event.rawPayload as any,
        },
      });

      // Sub-threshold: visible as "pending" but NOT credited — this is the
      // reorg-safety rule from Doc 8 §3.
      if (status !== DepositStatus.CONFIRMED) {
        return depositEvent;
      }

      return this.creditDeposit(depositEvent, address.userId, event.asset, event.amount);
    }

    // We've seen this tx before. If it's already credited, this is a genuine
    // no-op — never credit the same tx twice.
    if (existing.status === DepositStatus.CREDITED) {
      this.logger.log(`Duplicate webhook for already-credited tx ${event.txHash} — no-op`);
      return existing;
    }

    // Otherwise: update the confirmation count. If it just crossed the
    // threshold, credit the ledger now.
    const updated = await this.prisma.depositEvent.update({
      where: { id: existing.id },
      data: { confirmations: event.confirmations },
    });

    if (event.confirmations >= required) {
      return this.creditDeposit(updated, address.userId, event.asset, event.amount);
    }

    return updated;
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

    return this.prisma.depositEvent.update({
      where: { id: depositEvent.id },
      data: { status: DepositStatus.CREDITED, ledgerEntryId: ledgerEntry.id },
    });
  }

  async listDeposits(userId: string) {
    return this.prisma.depositEvent.findMany({
      where: { depositAddress: { userId } },
      orderBy: { createdAt: 'desc' },
    });
  }
}