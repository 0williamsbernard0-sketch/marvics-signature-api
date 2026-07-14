import { Body, Controller, Get, Param, Post, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UserRole } from '@prisma/client';

interface AuthenticatedAdmin {
  id: string;
  role: UserRole;
}

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  async search(@Query('q') q?: string) {
    return this.users.search(q);
  }

  @Post(':id/status')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedAdmin,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.users.updateStatus(id, dto.status, admin.role);
  }
}