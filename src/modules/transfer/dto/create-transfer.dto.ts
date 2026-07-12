import { IsString, IsNotEmpty, IsEmail, Matches } from 'class-validator';

export class CreateTransferDto {
  @IsEmail()
  recipientEmail: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{2,10}$/, { message: 'asset must be an uppercase asset code' })
  asset: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d+)?$/, { message: 'amount must be a positive decimal string' })
  amount: string;
}
