import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SupportService } from './support.service';
import { SupportController, AdminSupportController } from './support.controller';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService],
})
export class SupportModule {}
