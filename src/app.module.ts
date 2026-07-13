import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { TradingModule } from './modules/trading/trading.module';
import { WithdrawalsModule } from './modules/withdrawals/withdrawals.module';
import { ConversionModule } from './modules/conversion/conversion.module';
import { TransferModule } from './modules/transfer/transfer.module';
import { CommunityModule } from './modules/community/community.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SupportModule } from './modules/support/support.module';
import { validateEnv } from './common/config/env.validation';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AuthModule,
    LedgerModule,
    WalletsModule,
    TradingModule,
    WithdrawalsModule,
    ConversionModule,
    TransferModule,
    CommunityModule,
    ReferralsModule,
    PortfolioModule,
    NotificationsModule,
    SupportModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class AppModule {}