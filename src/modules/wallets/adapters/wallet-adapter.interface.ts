export interface AddressResult {
  address: string;
  providerRef: string;
}

export interface VerifiedDepositEvent {
  address: string;
  txHash: string;
  chain: string;
  asset: string;
  amount: string;
  confirmations: number;
  rawPayload: unknown;
}

export interface WithdrawalParams {
  asset: string;
  amount: string;
  destinationAddress: string;
}

export interface WithdrawalResult {
  providerRef: string;
  txHash?: string;
  rawResponse: unknown;
}

export interface WalletAdapter {
  createDepositAddress(userId: string, chain: string, asset: string): Promise<AddressResult>;
  handleWebhook(rawPayload: unknown, signatureHeader: string): Promise<VerifiedDepositEvent>;
  createWithdrawal(params: WithdrawalParams): Promise<WithdrawalResult>;
}