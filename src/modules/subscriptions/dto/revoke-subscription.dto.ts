import { IsIn } from 'class-validator';

export class RevokeSubscriptionDto {
  @IsIn(['TELEGRAM', 'SIGNAL', 'BOTH'])
  feature: 'TELEGRAM' | 'SIGNAL' | 'BOTH';
}
