import { IsIn, IsInt, Min } from 'class-validator';

export class GrantSubscriptionDto {
  @IsIn(['TELEGRAM', 'SIGNAL', 'BOTH'])
  feature: 'TELEGRAM' | 'SIGNAL' | 'BOTH';

  @IsInt()
  @Min(1)
  days: number;
}
