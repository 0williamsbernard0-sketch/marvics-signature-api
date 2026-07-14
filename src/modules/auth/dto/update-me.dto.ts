import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  displayName?: string;
}
