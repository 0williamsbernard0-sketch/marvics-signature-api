import { Body, Controller, Get, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TransferService } from './transfer.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

interface AuthenticatedUser {
  id: string;
}

@Controller('transfers')
@UseGuards(JwtAuthGuard)
export class TransferController {
  constructor(private transferService: TransferService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async transfer(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTransferDto) {
    return this.transferService.transfer(user.id, dto.recipientEmail, dto.asset, dto.amount);
  }

  @Get()
  async listTransfers(@CurrentUser() user: AuthenticatedUser) {
    return this.transferService.listTransfers(user.id);
  }
}
