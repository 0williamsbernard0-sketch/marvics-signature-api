import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { UpdateMeDto } from './dto/update-me.dto';
@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private authService: AuthService) {}
  @Get()
  async getMe(@CurrentUser() user: { authUserId: string; email: string }) {
    return this.authService.findOrCreateUser(user.authUserId, user.email);
  }
  @Patch()
  async updateMe(
    @CurrentUser() user: { authUserId: string },
    @Body() dto: UpdateMeDto,
  ) {
    return this.authService.updateDisplayName(user.authUserId, dto.displayName);
  }
}