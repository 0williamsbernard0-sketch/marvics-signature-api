import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ReferralsService } from './referrals.service';
import { ReferralsController, ReferralsAdminController } from './referrals.controller';

@Module({
  imports: [PrismaModule, LedgerModule],
  controllers: [ReferralsController, ReferralsAdminController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
