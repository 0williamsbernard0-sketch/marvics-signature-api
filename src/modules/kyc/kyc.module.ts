import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { KycController, AdminKycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { SupabaseStorageService } from '../../common/storage/supabase-storage.service';

@Module({
  imports: [PrismaModule],
  controllers: [KycController, AdminKycController],
  providers: [KycService, SupabaseStorageService],
})
export class KycModule {}
