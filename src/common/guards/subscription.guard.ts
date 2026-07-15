// src/common/guards/subscription.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { SUBSCRIPTION_KEY, SubscriptionFeature } from '../decorators/subscription.decorator';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<SubscriptionFeature>(SUBSCRIPTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.id) throw new ForbiddenException('Not authenticated');

    const sub = await this.prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
    });

    const now = new Date();
    const hasTelegram = !!sub?.telegramActive && !!sub.telegramExpiresAt && sub.telegramExpiresAt > now;
    const hasSignal = !!sub?.signalActive && !!sub.signalExpiresAt && sub.signalExpiresAt > now;

    if (required === 'TELEGRAM' && !hasTelegram) {
      throw new ForbiddenException('This feature requires an active Telegram Signals subscription.');
    }
    if (required === 'SIGNAL' && !hasSignal) {
      throw new ForbiddenException('This feature requires an active Signal Dashboard subscription.');
    }

    return true;
  }
}
