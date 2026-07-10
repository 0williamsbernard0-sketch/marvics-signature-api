// modules/wallets/dto/create-deposit-address.dto.ts
import { IsIn, IsString } from 'class-validator';

export class CreateDepositAddressDto {
  @IsString()
  @IsIn(['BTC', 'ETH'])
  chain: string;

  @IsString()
  asset: string;
}
