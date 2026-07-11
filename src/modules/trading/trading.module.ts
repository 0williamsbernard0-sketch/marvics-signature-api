import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { TradingService } from './trading.service';
import { TradingController } from './trading.controller';
import { BybitAdapter } from './adapters/bybit.adapter';
import { BinanceAdapter } from './adapters/binance.adapter';

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [TradingController],
  providers: [
    TradingService,
    BybitAdapter,
    BinanceAdapter,
    { provide: BybitAdapter, useExisting: BinanceAdapter },
  ],
  exports: [TradingService],
})
export class TradingModule {}