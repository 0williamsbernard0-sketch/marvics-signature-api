import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountStatus, UserRole } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async search(query?: string) {
    return this.prisma.user.findMany({
      where: query
        ? {
            OR: [
              { email: { contains: query, mode: 'insensitive' } },
              { displayName: { contains: query, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        kycStatus: true,
        createdAt: true,
      },
    });
  }

  // Only SUPER_ADMIN may mark an account DELETED — COMPLIANCE can freeze/
  // restrict/reactivate but not permanently delete.
  async updateStatus(userId: string, status: AccountStatus, adminRole: UserRole) {
    if (status === AccountStatus.DELETED && adminRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only SUPER_ADMIN can mark an account as DELETED');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Note: there's no statusReason field on User yet, so `reason` isn't
    // persisted on the row itself — but AuditLogInterceptor still captures
    // it in requestBody since this route is @Roles()-guarded, so it's not
    // lost, just not queryable directly on User.
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });
  }
}