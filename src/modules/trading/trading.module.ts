import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { TradingService } from './trading.service';
import { TradingController } from './trading.controller';
import { BinanceAdapter } from './adapters/binance.adapter';

@Module({
  imports: [PrismaModule, LedgerModule, ReferralsModule],
  controllers: [TradingController],
  providers: [TradingService, BinanceAdapter],
  exports: [TradingService, BinanceAdapter],
})
export class TradingModule {}