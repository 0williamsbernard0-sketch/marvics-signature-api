import { IsIn } from 'class-validator';

export class RequestUploadUrlDto {
  @IsIn(['ID_DOCUMENT', 'SELFIE', 'PROOF_OF_ADDRESS'])
  docType: 'ID_DOCUMENT' | 'SELFIE' | 'PROOF_OF_ADDRESS';
}
