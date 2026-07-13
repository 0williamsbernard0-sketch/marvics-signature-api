import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateMessageDto {
  @IsString() @MinLength(1)
  body: string;

  @IsOptional() @IsArray()
  attachmentUrls?: string[];
}
