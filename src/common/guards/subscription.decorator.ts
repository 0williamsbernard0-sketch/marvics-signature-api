// src/common/decorators/subscription.decorator.ts
import { SetMetadata } from '@nestjs/common';

export type SubscriptionFeature = 'TELEGRAM' | 'SIGNAL';
export const SUBSCRIPTION_KEY = 'subscription';
export const RequiresSubscription = (feature: SubscriptionFeature) =>
  SetMetadata(SUBSCRIPTION_KEY, feature);
