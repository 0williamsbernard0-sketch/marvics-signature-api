import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { validateEnv } from './common/config/env.validation';
// If req.rawBody is undefined despite rawBody:true, add this in main.ts
// right after app creation, before app.listen():
import * as bodyParser from 'body-parser';

app.use(
  '/v1/webhooks/tatum',
  bodyParser.raw({ type: 'application/json' }),
);

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    LedgerModule,
    WalletsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}