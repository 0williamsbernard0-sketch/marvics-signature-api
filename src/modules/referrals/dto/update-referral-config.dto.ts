import { IsOptional, IsString, IsNumberString } from 'class-validator';

export class UpdateReferralConfigDto {
  @IsOptional()
  @IsNumberString()
  firstDepositReward?: string;

  @IsOptional()
  @IsNumberString()
  firstTradeReward?: string;

  @IsOptional()
  @IsString()
  rewardAsset?: string;
}
