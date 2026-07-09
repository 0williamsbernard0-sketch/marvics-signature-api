import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private authService: AuthService) {}

  @Get()
  async getMe(@CurrentUser() user: { authUserId: string; email: string }) {
    return this.authService.findOrCreateUser(user.authUserId, user.email);
  }
}