import { IsString, Matches } from 'class-validator';

export class CompleteWithdrawalDto {
  // Loose on purpose — txHash formats differ meaningfully by chain (0x-prefixed
  // hex for EVM chains, different length/charset for BTC). Validate length
  // range and hex/base58-safe charset rather than a chain-specific format,
  // since this endpoint is shared across assets.
  @IsString()
  @Matches(/^[a-zA-Z0-9]{10,100}$/, {
    message: 'txHash must be a plausible transaction hash string',
  })
  txHash: string;
}
