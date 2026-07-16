import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { PaystackService } from './paystack.service';
import { NowPaymentsService } from './nowpayments.service';
import { SubscriptionExpiryCron } from './subscription-expiry.cron';

@Module({
  imports: [PrismaModule],
  controllers: [SubscriptionsController, AdminSubscriptionsController],
  providers: [SubscriptionsService, PaystackService, NowPaymentsService, SubscriptionExpiryCron],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
