// tatum.adapter.ts
import { Injectable, Logger, NotImplementedException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  WalletAdapter,
  AddressResult,
  VerifiedDepositEvent,
  WithdrawalParams,
  WithdrawalResult,
} from './wallet-adapter.interface';

const CHAIN_CONFIG: Record<
  string,
  { v3Path: string; v4Network: string; xpubEnvVar: string; privateKeyEnvVar: string }
> = {
  BTC: {
    v3Path: 'bitcoin',
    v4Network: 'bitcoin-testnet',
    xpubEnvVar: 'TATUM_BTC_XPUB',
    privateKeyEnvVar: 'TATUM_BTC_PRIVATE_KEY',
  },
  ETH: {
    v3Path: 'ethereum',
    v4Network: 'ethereum-sepolia',
    xpubEnvVar: 'TATUM_ETH_XPUB',
    privateKeyEnvVar: 'TATUM_ETH_PRIVATE_KEY',
  },
};

@Injectable()
export class TatumAdapter implements WalletAdapter {
  private readonly logger = new Logger(TatumAdapter.name);
  private readonly apiKey: string;
  private readonly webhookUrl: string;
  // NOTE: Railway's actual variable is named TATUM_WEBHOOK_HMAC_SECRET, not
  // TATUM_HMAC_SECRET — see handoff addendum v3 §3.1. Keep these in sync.
  private readonly hmacSecret: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.apiKey = this.configService.getOrThrow<string>('TATUM_API_KEY');
    this.webhookUrl = this.configService.getOrThrow<string>('TATUM_WEBHOOK_URL');
    this.hmacSecret = this.configService.getOrThrow<string>('TATUM_WEBHOOK_HMAC_SECRET');
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
      let parsed: any;
      try {
        parsed = JSON.parse(body);
      } catch {
        parsed = null;
      }

      // Idempotent case: a subscription for this exact address+currency+url
      // already exists (e.g. a prior attempt succeeded here but failed to
      // persist the DepositAddress row afterward). The subscription is still
      // correctly in place on Tatum's side, so this isn't a real failure —
      // just continue as if creation succeeded.
      if (res.status === 403 && parsed?.errorCode === 'subscription.exists.on.address-and-currency') {
        this.logger.warn(`Subscription already exists for ${address} — treating as success.`);
        return;
      }

      throw new Error(`Tatum subscription creation failed (${res.status}): ${body}`);
    }
  }

  // ---------------------------------------------------------------------
  // Webhook handling
  // ---------------------------------------------------------------------
  // Signature verification restored per handoff addendum v3 §2–§3:
  //   - HMAC secret is set account-wide via a one-time PUT /v4/subscription
  //     call with { hmacSecret }, not exposed in Tatum's dashboard.
  //   - Signature arrives in the `x-payload-hash` header.
  //   - Algorithm: HMAC-SHA512 over JSON.stringify(body), Base64-encoded
  //     (not hex — this differs from the more common GitHub/Stripe pattern).
  private verifySignature(rawBody: Buffer, signatureHeader: string | undefined): void {
    if (!signatureHeader) {
      throw new UnauthorizedException('Missing x-payload-hash header on Tatum webhook');
    }

    const expected = crypto.createHmac('sha512', this.hmacSecret).update(rawBody).digest('base64');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(signatureHeader, 'utf8');

    const isValid =
      expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf);

    if (!isValid) {
      throw new UnauthorizedException('Invalid Tatum webhook signature');
    }
  }

  async handleWebhook(rawPayload: unknown, signatureHeader: string): Promise<VerifiedDepositEvent> {
    const rawBody = Buffer.isBuffer(rawPayload) ? rawPayload : Buffer.from(JSON.stringify(rawPayload));

    this.verifySignature(rawBody, signatureHeader);

    const payload = JSON.parse(rawBody.toString('utf8')) as {
      address: string;
      amount: string;
      asset: string;
      txId: string;
      chain: string;
      blockNumber?: number;
    };

    // Confirmed via a real captured payload (handoff addendum v3 §4): Tatum
    // does NOT send a confirmations count, and only fires ADDRESS_EVENT once,
    // after its OWN internal confirmation threshold is already met (1 conf for
    // EVM, 2 for UTXO chains like BTC) — the presence of `blockNumber` here
    // corroborates that the tx is already mined by the time we're called.
    // `confirmations: 0` below is now purely informational/unused — the real
    // gating logic lives in WalletsService, which no longer waits on this
    // value. See WalletsService.handleWebhook for the actual fix.
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
  // Withdrawals — Milestone 4, testnet-custodial approach
  // ---------------------------------------------------------------------
  // SECURITY NOTE: this signs using a raw private key passed directly to
  // Tatum's API, read from an env var. This is only safe for TESTNET keys
  // with no real value. Before mainnet / real customer funds, this must be
  // replaced with the AWS/GCP KMS approach (build+sign separately, private
  // key never enters this app's memory or env at all).
  async createWithdrawal(params: WithdrawalParams): Promise<WithdrawalResult> {
    const cfg = CHAIN_CONFIG[params.asset];
    if (!cfg) {
      throw new NotImplementedException(`Chain ${params.asset} is not yet configured for withdrawals`);
    }

    const privateKey = this.configService.getOrThrow<string>(cfg.privateKeyEnvVar);
    const fromAddress = this.configService.getOrThrow<string>(`TATUM_${params.asset}_SOURCE_ADDRESS`);

    if (params.asset === 'BTC') {
      return this.broadcastBtcWithdrawal(fromAddress, privateKey, params);
    }
    if (params.asset === 'ETH') {
      return this.broadcastEthWithdrawal(privateKey, params);
    }

    throw new NotImplementedException(`No broadcast logic implemented for ${params.asset}`);
  }

  private async broadcastBtcWithdrawal(
    fromAddress: string,
    privateKey: string,
    params: WithdrawalParams,
  ): Promise<WithdrawalResult> {
    const res = await fetch('https://api.tatum.io/v3/bitcoin/transaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
            body: JSON.stringify({
        fromAddress: [{ address: fromAddress, privateKey }],
        to: [{ address: params.destinationAddress, value: params.amount }],
      }),
    });

    const rawResponse = await res.json();

    if (!res.ok) {
      throw new Error(`Tatum BTC withdrawal broadcast failed (${res.status}): ${JSON.stringify(rawResponse)}`);
    }

    return {
      providerRef: rawResponse.txId,
      txHash: rawResponse.txId,
      rawResponse,
    };
  }

  private async broadcastEthWithdrawal(
    privateKey: string,
    params: WithdrawalParams,
  ): Promise<WithdrawalResult> {
    const res = await fetch('https://api.tatum.io/v3/ethereum/transaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify({
        fromPrivateKey: privateKey,
        to: params.destinationAddress,
        amount: params.amount,
        currency: 'ETH',
      }),
    });

    const rawResponse = await res.json();

    if (!res.ok) {
      throw new Error(`Tatum ETH withdrawal broadcast failed (${res.status}): ${JSON.stringify(rawResponse)}`);
    }

    return {
      providerRef: rawResponse.txId,
      txHash: rawResponse.txId,
      rawResponse,
    };
  }
}
