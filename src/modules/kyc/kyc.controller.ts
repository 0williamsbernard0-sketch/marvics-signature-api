import { Body, Controller, Get, Param, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { KycService } from './kyc.service';
import { RequestUploadUrlDto } from './dto/request-upload-url.dto';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { RejectKycDto } from './dto/reject-kyc.dto';
import { UserRole } from '@prisma/client';

interface AuthenticatedUser {
  id: string;
}

const REVIEWER_ROLES = [UserRole.COMPLIANCE, UserRole.SUPER_ADMIN];

@ApiTags('kyc')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('kyc')
export class KycController {
  constructor(private kyc: KycService) {}

  @Post('upload-url')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  requestUploadUrl(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestUploadUrlDto) {
    return this.kyc.requestUploadUrl(user.id, dto.docType);
  }

  @Post('submit')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  submit(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitKycDto) {
    return this.kyc.submit(user.id, dto.idDocumentPath, dto.selfiePath, dto.proofOfAddressPath);
  }

  @Get()
  listOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.kyc.listOwn(user.id);
  }
}

@ApiTags('admin-kyc')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...REVIEWER_ROLES)
@Controller('admin/kyc')
export class AdminKycController {
  constructor(private kyc: KycService) {}

  @Get('queue')
  queue() {
    return this.kyc.listQueue();
  }

  @Get(':id/review')
  review(@Param('id') id: string) {
    return this.kyc.getReviewUrls(id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser) {
    return this.kyc.approve(id, admin.id);
  }

  @Post(':id/reject')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  reject(@Param('id') id: string, @CurrentUser() admin: AuthenticatedUser, @Body() dto: RejectKycDto) {
    return this.kyc.reject(id, admin.id, dto.reason);
  }
}
