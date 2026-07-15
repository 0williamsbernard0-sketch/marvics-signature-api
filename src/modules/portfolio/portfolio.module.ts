import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TradingModule } from '../trading/trading.module';
import { PortfolioService } from './portfolio.service';
import { PortfolioController } from './portfolio.controller';
@Module({
  imports: [PrismaModule, TradingModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}