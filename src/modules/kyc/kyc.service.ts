import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseStorageService } from '../../common/storage/supabase-storage.service';
import { KycStatus } from '@prisma/client';

type DocType = 'ID_DOCUMENT' | 'SELFIE' | 'PROOF_OF_ADDRESS';

@Injectable()
export class KycService {
  constructor(
    private prisma: PrismaService,
    private storage: SupabaseStorageService,
  ) {}

  async requestUploadUrl(userId: string, docType: DocType) {
    const path = `${userId}/${docType.toLowerCase()}-${randomUUID()}`;
    return this.storage.createUploadUrl(path);
  }

  async submit(userId: string, idDocumentPath: string, selfiePath: string, proofOfAddressPath: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.kycStatus === KycStatus.VERIFIED) {
      throw new ForbiddenException('Identity is already verified');
    }

    const existingPending = await this.prisma.kycSubmission.findFirst({
      where: { userId, status: KycStatus.PENDING },
    });
    if (existingPending) {
      throw new ForbiddenException('A KYC submission is already under review');
    }

    const submission = await this.prisma.kycSubmission.create({
      data: { userId, idDocumentPath, selfiePath, proofOfAddressPath, status: KycStatus.PENDING },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { kycStatus: KycStatus.PENDING },
    });

    return submission;
  }

  async listOwn(userId: string) {
    return this.prisma.kycSubmission.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- Admin / COMPLIANCE actions ----

  async listQueue() {
    return this.prisma.kycSubmission.findMany({
      where: { status: KycStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { email: true } } },
    });
  }

  // Admin needs actual viewable links, not raw storage paths.
  async getReviewUrls(submissionId: string) {
    const submission = await this.prisma.kycSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException('KYC submission not found');

    const [idDocumentUrl, selfieUrl, proofOfAddressUrl] = await Promise.all([
      this.storage.createReadUrl(submission.idDocumentPath),
      this.storage.createReadUrl(submission.selfiePath),
      this.storage.createReadUrl(submission.proofOfAddressPath),
    ]);

    return { ...submission, idDocumentUrl, selfieUrl, proofOfAddressUrl };
  }

  async approve(submissionId: string, adminId: string) {
    const submission = await this.prisma.kycSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException('KYC submission not found');
    if (submission.status !== KycStatus.PENDING) {
      throw new BadRequestException(`Cannot approve a submission in status ${submission.status}`);
    }

    const updated = await this.prisma.kycSubmission.update({
      where: { id: submissionId },
      data: { status: KycStatus.VERIFIED, reviewedBy: adminId, reviewedAt: new Date() },
    });

    await this.prisma.user.update({
      where: { id: submission.userId },
      data: { kycStatus: KycStatus.VERIFIED },
    });

    return updated;
  }

  async reject(submissionId: string, adminId: string, reason: string) {
    const submission = await this.prisma.kycSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) throw new NotFoundException('KYC submission not found');
    if (submission.status !== KycStatus.PENDING) {
      throw new BadRequestException(`Cannot reject a submission in status ${submission.status}`);
    }

    const updated = await this.prisma.kycSubmission.update({
      where: { id: submissionId },
      data: { status: KycStatus.REJECTED, reviewedBy: adminId, reviewedAt: new Date(), rejectionReason: reason },
    });

    await this.prisma.user.update({
      where: { id: submission.userId },
      data: { kycStatus: KycStatus.REJECTED },
    });

    return updated;
  }
}
