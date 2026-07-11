// tatum.adapter.ts
import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  WalletAdapter,
  AddressResult,
  VerifiedDepositEvent,
  WithdrawalParams,
  WithdrawalResult,
} from './wallet-adapter.interface';

const CHAIN_CONFIG: Record<string, { v3Path: string; v4Network: string; xpubEnvVar: string }> = {
  BTC: { v3Path: 'bitcoin', v4Network: 'bitcoin-testnet', xpubEnvVar: 'TATUM_BTC_XPUB' },
  ETH: { v3Path: 'ethereum', v4Network: 'ethereum-sepolia', xpubEnvVar: 'TATUM_ETH_XPUB' },
};

@Injectable()
export class TatumAdapter implements WalletAdapter {
  private readonly logger = new Logger(TatumAdapter.name);
  private readonly apiKey: string;
  private readonly webhookUrl: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.apiKey = this.configService.getOrThrow<string>('TATUM_API_KEY');
    this.webhookUrl = this.configService.getOrThrow<string>('TATUM_WEBHOOK_URL');
  }

  // ---------------------------------------------------------------------
  // Deposit address generation
  // ---------------------------------------------------------------------

  async createDepositAddress(userId: string, chain: string, asset: string): Promise<AddressResult> {
    const cfg = CHAIN_CONFIG[chain];
    if (!cfg) {
      throw new NotImplementedException(`Chain ${chain} is not yet configured in TatumAdapter`);
    }

    const xpub = this.configService.getOrThrow<string>(cfg.xpubEnvVar);

    const MAX_ATTEMPTS = 5;
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const index = await this.prisma.depositAddress.count({ where: { chain } });

      try {
        const address = await this.deriveAddress(cfg.v3Path, xpub, index);
        await this.createSubscription(cfg.v4Network, address);

        return {
          address,
          providerRef: `${xpub}:${index}`,
        };
      } catch (err: any) {
        if (err?.code === 'P2002') {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    throw new Error(
      `Failed to allocate a unique deposit address for chain ${chain} after ${MAX_ATTEMPTS} attempts: ${lastError}`,
    );
  }

  private async deriveAddress(v3Path: string, xpub: string, index: number): Promise<string> {
    const res = await fetch(`https://api.tatum.io/v3/${v3Path}/address/${xpub}/${index}`, {
      headers: { 'x-api-key': this.apiKey },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Tatum address derivation failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { address: string };
    return data.address;
  }

  private async createSubscription(v4Network: string, address: string): Promise<void> {
    const res = await fetch('https://api.tatum.io/v4/subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({
        type: 'ADDRESS_EVENT',
        attr: {
          chain: v4Network,
          address,
          url: this.webhookUrl,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Tatum subscription creation failed (${res.status}): ${body}`);
    }
  }

  // ---------------------------------------------------------------------
  // Webhook handling
  // ---------------------------------------------------------------------
  // TEMPORARY: signature verification is BYPASSED while we confirm Tatum's
  // current HMAC mechanism (their dashboard doesn't expose the shared-secret
  // flow the original design assumed). Testnet only, no real funds at risk.
  //
  // MUST be restored before Milestone 4 (withdrawals) / any mainnet use —
  // an unverified webhook lets anyone who finds this URL fake a "deposit"
  // and get credited for free. Revisit via Tatum's docs or support before
  // going live with real funds.

  async handleWebhook(rawPayload: unknown, signatureHeader: string): Promise<VerifiedDepositEvent> {
    this.logger.warn('Tatum webhook signature check is currently BYPASSED — testnet only');

    const rawBody = Buffer.isBuffer(rawPayload) ? rawPayload : Buffer.from(JSON.stringify(rawPayload));

    const payload = JSON.parse(rawBody.toString('utf8')) as {
      address: string;
      amount: string;
      asset: string;
      txId: string;
      chain: string;
    };
   
     this.logger.warn(`RAW TATUM PAYLOAD: ${JSON.stringify(payload)}`); // TEMP DIAGNOSTIC

    return {
      address: payload.address,
      txHash: payload.txId,
      chain: payload.chain,
      asset: payload.asset,
      amount: payload.amount,
      confirmations: 0,
      rawPayload: payload,
    };
  }

  // ---------------------------------------------------------------------
  // Withdrawals — deferred to Milestone 4
  // ---------------------------------------------------------------------

  async createWithdrawal(params: WithdrawalParams): Promise<WithdrawalResult> {
    throw new NotImplementedException(
      'Withdrawals are scoped for Milestone 4 and require a KMS/signing design decision first',
    );
  }
}