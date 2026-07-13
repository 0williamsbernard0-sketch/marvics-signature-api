import { Body, Controller, Get, Patch, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReferralsService } from './referrals.service';
import { UpdateReferralConfigDto } from './dto/update-referral-config.dto';
import { UserRole } from '@prisma/client';

interface AuthenticatedUser { id: string; }

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private referralsService: ReferralsService) {}

  @Get('me')
  async getMyReferrals(@CurrentUser() user: AuthenticatedUser) {
    return this.referralsService.getMyReferrals(user.id);
  }
}

@Controller('admin/referrals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReferralsAdminController {
  constructor(private referralsService: ReferralsService) {}

  @Get('config')
  @Roles(UserRole.SUPER_ADMIN)
  async getConfig() {
    return this.referralsService.getConfig();
  }

  @Patch('config')
  @Roles(UserRole.SUPER_ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async updateConfig(@Body() dto: UpdateReferralConfigDto) {
    return this.referralsService.updateConfig(dto);
  }
}
