import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PortfolioService } from './portfolio.service';
interface AuthenticatedUser { id: string; }
@Controller('portfolio')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private portfolioService: PortfolioService) {}
  @Get()
  async getPortfolio(@CurrentUser() user: AuthenticatedUser) {
    return this.portfolioService.getPortfolio(user.id);
  }
  @Get('activity')
  async getActivity(@CurrentUser() user: AuthenticatedUser) {
    return this.portfolioService.getRecentActivity(user.id);
  }
}