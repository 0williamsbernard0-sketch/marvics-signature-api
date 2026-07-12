import { Body, Controller, Get, Param, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { CompleteWithdrawalDto } from './dto/complete-withdrawal.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WithdrawalsService } from './withdrawals.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { UserRole } from '@prisma/client';
interface AuthenticatedUser {
  id: string;
}
@Controller()
@UseGuards(JwtAuthGuard)
export class WithdrawalsController {
  constructor(private withdrawalsService: WithdrawalsService) {}
  @Post('withdrawals')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async requestWithdrawal(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWithdrawalDto) {
    return this.withdrawalsService.requestWithdrawal(user.id, dto.asset, dto.amount, dto.destinationAddress);
  }
  @Get('withdrawals')
  async listMyWithdrawals(@CurrentUser() user: AuthenticatedUser) {
    return this.withdrawalsService.listWithdrawals(user.id);
  }
  @Get('admin/withdrawals/queue')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
  async queue() {
    return this.withdrawalsService.listPendingReview();
  }
  @Post('admin/withdrawals/:id/approve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
  async approve(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.withdrawalsService.approve(id, admin.id);
  }
  @Post('admin/withdrawals/:id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
  async reject(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body('reason') reason: string,
  ) {
    return this.withdrawalsService.reject(id, admin.id, reason);
  }
  @Post('admin/withdrawals/:id/complete')
  @UseGuards(RolesGuard)
  @Roles(UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async complete(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CompleteWithdrawalDto,
  ) {
    return this.withdrawalsService.complete(id, admin.id, dto.txHash);
  }
}