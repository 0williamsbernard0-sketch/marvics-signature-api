import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { SubscriptionsService } from './subscriptions.service';
import { GrantSubscriptionDto } from './dto/grant-subscription.dto';
import { RevokeSubscriptionDto } from './dto/revoke-subscription.dto';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
export class AdminSubscriptionsController {
  constructor(private subs: SubscriptionsService) {}

  @Get(':id/subscription')
  async getStatus(@Param('id') id: string) {
    return this.subs.getStatus(id);
  }

  @Post(':id/subscription/grant')
  async grant(@Param('id') id: string, @Body() dto: GrantSubscriptionDto) {
    return this.subs.grantAccess(id, dto.feature, dto.days);
  }

  @Post(':id/subscription/revoke')
  async revoke(@Param('id') id: string, @Body() dto: RevokeSubscriptionDto) {
    return this.subs.revokeAccess(id, dto.feature);
  }
}
