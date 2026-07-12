import { Body, Controller, Get, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConversionService } from './conversion.service';
import { CreateConversionDto } from './dto/create-conversion.dto';

interface AuthenticatedUser {
  id: string;
}

@Controller('conversions')
@UseGuards(JwtAuthGuard)
export class ConversionController {
  constructor(private conversionService: ConversionService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async convert(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateConversionDto) {
    return this.conversionService.convert(user.id, dto.fromAsset, dto.toAsset, dto.amount);
  }

  @Get()
  async listConversions(@CurrentUser() user: AuthenticatedUser) {
    return this.conversionService.listConversions(user.id);
  }
}
