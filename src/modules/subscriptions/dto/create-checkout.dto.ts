import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SubscriptionPlan } from '@prisma/client';

export class CreateCheckoutDto {
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;

  // Required only for the NOWPayments (crypto) checkout path -- e.g. 'btc', 'eth', 'usdt', 'usdc'
  @IsOptional()
  @IsString()
  payCurrency?: string;
}