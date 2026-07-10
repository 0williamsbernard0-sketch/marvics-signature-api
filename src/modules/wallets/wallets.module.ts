import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';
import { TatumAdapter } from './adapters/tatum.adapter';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [WalletsController],
  providers: [WalletsService, TatumAdapter],
  exports: [WalletsService],
})
export class WalletsModule {}