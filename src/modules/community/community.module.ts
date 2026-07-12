import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommunityService } from './community.service';
import { CommunityController, CommunityAdminController } from './community.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CommunityController, CommunityAdminController],
  providers: [CommunityService],
})
export class CommunityModule {}