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

    // Idempotency: DepositEvent has @@unique([txHash, chain]) in schema.prisma.
    // A retried webhook for a tx we've already seen is a no-op, not a duplicate credit.
    const existing = await this.prisma.depositEvent.findUnique({
      where: { txHash_chain: { txHash: event.txHash, chain: event.chain } },
    });
    if (existing) {
      this.logger.log(`Duplicate webhook for tx ${event.txHash} — no-op`);
      return existing;
    }

    const address = await this.prisma.depositAddress.findUnique({
      where: { address: event.address },
    });
    if (!address) {
      this.logger.warn(`Webhook for unknown address ${event.address} — ignoring`);
      return null;
    }

    const required = REQUIRED_CONFIRMATIONS[event.chain] ?? 6;
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

    const ledgerEntry = await this.ledger.postEntry({
      userId: address.userId,
      asset: event.asset,
      amount: event.amount,          // positive = credit
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
