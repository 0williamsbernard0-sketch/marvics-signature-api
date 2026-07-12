import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { WithdrawalsService } from './withdrawals.service';
import { WithdrawalsController } from './withdrawals.controller';

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [WithdrawalsController],
  providers: [WithdrawalsService],
})
export class WithdrawalsModule {}
