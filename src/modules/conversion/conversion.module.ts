import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ConversionService } from './conversion.service';
import { ConversionController } from './conversion.controller';

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [ConversionController],
  providers: [ConversionService],
})
export class ConversionModule {}
