import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class CreateConversionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{2,10}$/, { message: 'fromAsset must be an uppercase asset code' })
  fromAsset: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{2,10}$/, { message: 'toAsset must be an uppercase asset code' })
  toAsset: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d+)?$/, { message: 'amount must be a positive decimal string' })
  amount: string;
}
