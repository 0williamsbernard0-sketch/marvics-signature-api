// tatum.adapter.ts
import { Injectable, Logger, NotImplementedException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  WalletAdapter,
  AddressResult,
  VerifiedDepositEvent,
  WithdrawalParams,
  WithdrawalResult,
} from './wallet-adapter.interface';

// Maps our internal chain codes to Tatum's v3 path segment (address derivation)
// and v4 network identifier (subscriptions). Confirm against
// https://docs.tatum.io/docs/supported-blockchains before adding a new chain.
const CHAIN_CONFIG: Record<string, { v3Path: string; v4Network: string; xpubEnvVar: string }> = {
  BTC: { v3Path: 'bitcoin', v4Network: 'bitcoin-testnet', xpubEnvVar: 'TATUM_BTC_XPUB' },
  ETH: { v3Path: 'ethereum', v4Network: 'ethereum-sepolia', xpubEnvVar: 'TATUM_ETH_XPUB' },
};

@Injectable()
export class TatumAdapter implements WalletAdapter {
  private readonly logger = new Logger(TatumAdapter.name);
  private readonly apiKey: string;
  private readonly webhookUrl: string;
  private readonly hmacSecret: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.apiKey = this.configService.getOrThrow<string>('TATUM_API_KEY');
    this.webhookUrl = this.configService.getOrThrow<string>('TATUM_WEBHOOK_URL'); // e.g. https://api.marvicssignature.com/v1/webhooks/tatum
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

    // Derivation index must be unique per xpub and assigned sequentially.
    // We derive it from how many addresses we've already generated on this
    // chain, with a retry loop in case two requests race on the same index
    // (protected ultimately by DepositAddress's @@unique([userId, chain, asset])
    // and the address column's own @unique constraint).
    const MAX_ATTEMPTS = 5;
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const index = await this.prisma.depositAddress.count({ where: { chain } });

      try {
        const address = await this.deriveAddress(cfg.v3Path, xpub, index);

        // Register a Tatum notification subscription so deposits to this
        // specific address actually trigger a webhook. Without this call,
        // the address is valid but silent.
        await this.createSubscription(cfg.v4Network, address);

        return {
          address,
          providerRef: `${xpub}:${index}`,
        };
      } catch (err: any) {
        // Unique constraint violation on address (P2002) -> another request
        // grabbed this index first. Retry with a freshly recomputed count.
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
      // Don't let a subscription failure silently produce a "working" address
      // that never actually notifies us of deposits.
      throw new Error(`Tatum subscription creation failed (${res.status}): ${body}`);
    }
  }

  // ---------------------------------------------------------------------
  // Webhook verification
  // ---------------------------------------------------------------------
  // IMPORTANT: the NestJS route handling POST /webhooks/tatum must be
  // configured to capture the RAW request body (not the JSON-parsed object)
  // for this to work, e.g.:
  //   @Post('webhooks/tatum')
  //   handle(@Req() req: RawBodyRequest<Request>, @Headers('x-payload-hash') sig: string) {
  //     return this.walletsService.handleWebhook(req.rawBody, sig);
  //   }
  // and main.ts must enable rawBody capture: NestFactory.create(AppModule, { rawBody: true })

  async handleWebhook(rawPayload: unknown, signatureHeader: string): Promise<VerifiedDepositEvent> {
    if (!signatureHeader) {
      throw new UnauthorizedException('Missing x-payload-hash header');
    }

    const rawBody = Buffer.isBuffer(rawPayload) ? rawPayload : Buffer.from(JSON.stringify(rawPayload));

    const expected = createHmac('sha512', this.hmacSecret).update(rawBody).digest('base64');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signatureHeader, 'utf8');

    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn('Tatum webhook signature mismatch — rejecting');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const payload = JSON.parse(rawBody.toString('utf8')) as {
      address: string;
      amount: string;
      asset: string;
      txId: string;
      chain: string;
      blockNumber?: number;
      counterAddress?: string;
      type?: string;
    };

    return {
      address: payload.address,
      txHash: payload.txId,
      chain: payload.chain,
      asset: payload.asset,
      amount: payload.amount,
      // Tatum's ADDRESS_EVENT payload doesn't include a confirmations count
      // directly — confirmation depth should be tracked via a follow-up
      // reconciliation poll (per Doc 8 §3) rather than assumed from this event.
      confirmations: 0,
      rawPayload: payload,
    };
  }

  // ---------------------------------------------------------------------
  // Withdrawals — intentionally deferred to Milestone 4
  // ---------------------------------------------------------------------
  // Real withdrawal signing needs the mnemonic/private key, which is a much
  // bigger security surface than deposit address derivation (xpub-only).
  // Storing the mnemonic as a Railway env var and signing in this service
  // is NOT the recommended path — Tatum's own guidance is to use Tatum KMS
  // (a separate, locally-run signer) or an HSM, so the seed never sits in
  // application memory. That decision belongs in Doc 6/Doc 8 review before
  // Milestone 4, not bolted on here.

  async createWithdrawal(params: WithdrawalParams): Promise<WithdrawalResult> {
    throw new NotImplementedException(
      'Withdrawals are scoped for Milestone 4 and require a KMS/signing design decision first',
    );
  }
}
