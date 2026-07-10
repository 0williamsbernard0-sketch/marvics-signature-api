import { Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalletAdapter, AddressResult, VerifiedDepositEvent, WithdrawalParams, WithdrawalResult } from './wallet-adapter.interface';

@Injectable()
export class TatumAdapter implements WalletAdapter {
  constructor(private configService: ConfigService) {}

  async createDepositAddress(userId: string, chain: string, asset: string): Promise<AddressResult> {
    // TODO: call Tatum's virtual-account/address API once TATUM_API_KEY is configured
    throw new NotImplementedException('Tatum API key not yet configured');
  }

  async handleWebhook(rawPayload: unknown, signatureHeader: string): Promise<VerifiedDepositEvent> {
    // TODO: verify HMAC signature against TATUM_WEBHOOK_SECRET before trusting payload
    throw new NotImplementedException('Tatum webhook verification not yet configured');
  }

  async createWithdrawal(params: WithdrawalParams): Promise<WithdrawalResult> {
    throw new NotImplementedException('Tatum API key not yet configured');
  }
}