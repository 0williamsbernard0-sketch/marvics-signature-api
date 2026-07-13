import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BinanceAdapter } from './adapters/binance.adapter';
import { LedgerService } from '../ledger/ledger.service';
import { ReferralsService } from '../referrals/referrals.service';
import { LedgerEntryType, OrderSide, OrderStatus, Prisma } from '@prisma/client';

@Injectable()
export class TradingService {
  constructor(
    private prisma: PrismaService,
    private exchange: BinanceAdapter,
    private ledger: LedgerService,
    private referrals: ReferralsService,
  ) {}

  async placeOrder(userId: string, side: OrderSide, symbol: string, quantity: string) {
    const quoteAsset = symbol.endsWith('USDT') ? 'USDT' : symbol.slice(-3);
    const baseAsset = symbol.replace(quoteAsset, '');

    if (side === 'BUY') {
      const balance = await this.ledger.getBalance(userId, quoteAsset);
      if (balance.lt(new Prisma.Decimal(quantity))) {
        throw new BadRequestException(`Insufficient ${quoteAsset} balance`);
      }
    } else {
      const balance = await this.ledger.getBalance(userId, baseAsset);
      if (balance.lt(new Prisma.Decimal(quantity))) {
        throw new BadRequestException(`Insufficient ${baseAsset} balance`);
      }
    }

    const result = await this.exchange.placeOrder({ side, symbol, quantity });

    const order = await this.prisma.order.create({
      data: {
        userId,
        side,
        symbol,
        exchange: this.exchange.exchangeName,
        exchangeOrderId: result.exchangeOrderId,
        requestedQty: new Prisma.Decimal(quantity),
        filledQty: result.filledQty ? new Prisma.Decimal(result.filledQty) : null,
        filledPrice: result.filledPrice ? new Prisma.Decimal(result.filledPrice) : null,
        fees: result.fees ? new Prisma.Decimal(result.fees) : null,
        feeAsset: result.feeAsset,
        status: result.status as OrderStatus,
        rawExchangeResponse: result.rawResponse as any,
      },
    });

    if (result.status !== 'FILLED' && result.status !== 'PARTIALLY_FILLED') {
      return order;
    }

    const ledgerEntryIds: string[] = [];
    if (side === 'BUY') {
      const debit = await this.ledger.postEntry({
        userId,
        asset: quoteAsset,
        amount: `-${result.quoteAmount}`,
        entryType: LedgerEntryType.TRADE_BUY,
        referenceType: 'order',
        referenceId: order.id,
      });
      const credit = await this.ledger.postEntry({
        userId,
        asset: baseAsset,
        amount: result.filledQty!,
        entryType: LedgerEntryType.TRADE_BUY,
        referenceType: 'order',
        referenceId: order.id,
      });
      ledgerEntryIds.push(debit.id, credit.id);
    } else {
      const debit = await this.ledger.postEntry({
        userId,
        asset: baseAsset,
        amount: `-${result.filledQty}`,
        entryType: LedgerEntryType.TRADE_SELL,
        referenceType: 'order',
        referenceId: order.id,
      });
      const credit = await this.ledger.postEntry({
        userId,
        asset: quoteAsset,
        amount: result.quoteAmount!,
        entryType: LedgerEntryType.TRADE_SELL,
        referenceType: 'order',
        referenceId: order.id,
      });
      ledgerEntryIds.push(debit.id, credit.id);
    }

    // Referral trigger — idempotent, safe on retries, never blocks the trade.
    try {
      await this.referrals.triggerReward(userId, 'first_trade');
    } catch (err) {
      // Deliberately swallowed the same way a webhook failure is in
      // WalletsService — a referral-payout failure must never roll back
      // or fail an already-executed trade.
    }

    return this.prisma.order.update({
      where: { id: order.id },
      data: { ledgerEntryIds },
    });
  }

  async listOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
