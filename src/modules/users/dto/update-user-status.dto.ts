import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AccountStatus } from '@prisma/client';

export class UpdateUserStatusDto {
  @IsEnum(AccountStatus)
  status: AccountStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}