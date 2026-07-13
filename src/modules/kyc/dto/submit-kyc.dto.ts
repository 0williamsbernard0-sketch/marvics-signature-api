import { IsNotEmpty, IsString } from 'class-validator';

export class SubmitKycDto {
  @IsString() @IsNotEmpty() idDocumentPath: string;
  @IsString() @IsNotEmpty() selfiePath: string;
  @IsString() @IsNotEmpty() proofOfAddressPath: string;
}
