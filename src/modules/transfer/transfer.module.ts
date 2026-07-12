import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { TransferService } from './transfer.service';
import { TransferController } from './transfer.controller';

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [TransferController],
  providers: [TransferService],
})
export class TransferModule {}
