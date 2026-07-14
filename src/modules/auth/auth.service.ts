import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomBytes } from 'crypto';
@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}
  private generateReferralCode(): string {
    return randomBytes(4).toString('hex').toUpperCase();
  }
  async findOrCreateUser(authUserId: string, email: string) {
    const existing = await this.prisma.user.findUnique({
      where: { authUserId },
    });
    if (existing) return existing;
    return this.prisma.user.create({
      data: {
        authUserId,
        email,
        referralCode: this.generateReferralCode(),
      },
    });
  }
  async updateDisplayName(authUserId: string, displayName?: string) {
    return this.prisma.user.update({
      where: { authUserId },
      data: { displayName },
    });
  }
}