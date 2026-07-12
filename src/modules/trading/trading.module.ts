import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { TradingService } from './trading.service';
import { TradingController } from './trading.controller';
import { ConversionService } from './conversion.service';
import { ConversionController } from './conversion.controller';
import { TransferService } from './transfer.service';
import { TransferController } from './transfer.controller';
import { BinanceAdapter } from './adapters/binance.adapter';
@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [TradingController, ConversionController, TransferController],
  providers: [TradingService, ConversionService, TransferService, BinanceAdapter],
  exports: [TradingService, ConversionService, TransferService, BinanceAdapter],
})
export class TradingModule {}