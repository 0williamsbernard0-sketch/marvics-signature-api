import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';
import { TatumAdapter } from './adapters/tatum.adapter';

@Module({
  imports: [PrismaModule, AuthModule, LedgerModule, ReferralsModule],
  controllers: [WalletsController],
  providers: [WalletsService, TatumAdapter],
  exports: [WalletsService, TatumAdapter],
})
export class WalletsModule {}
