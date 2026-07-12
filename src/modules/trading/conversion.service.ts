import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BinanceAdapter } from './adapters/binance.adapter';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerEntryType, Prisma } from '@prisma/client';

@Injectable()
export class ConversionService {
  constructor(
    private prisma: PrismaService,
    private exchange: BinanceAdapter,
    private ledger: LedgerService,
  ) {}

  async convert(userId: string, fromAsset: string, toAsset: string, amountStr: string) {
    const amount = new Prisma.Decimal(amountStr);

    const balance = await this.ledger.getBalance(userId, fromAsset);
    if (balance.lt(amount)) {
      throw new BadRequestException(`Insufficient ${fromAsset} balance`);
    }

    // Try the direct pair first (e.g. BTCUSDT). If that symbol doesn't exist
    // on Binance, fall back to the inverse pair (e.g. USDTBTC isn't real —
    // invert ETHUSDT-style pricing instead of assuming a reverse symbol exists).
    const directSymbol = `${fromAsset}${toAsset}`;
    let rate: Prisma.Decimal;
    let toAmount: Prisma.Decimal;

    try {
      const price = await this.exchange.getPrice(directSymbol);
      rate = new Prisma.Decimal(price);
      toAmount = amount.mul(rate);
    } catch {
      const inverseSymbol = `${toAsset}${fromAsset}`;
      const price = await this.exchange.getPrice(inverseSymbol);
      rate = new Prisma.Decimal(1).div(new Prisma.Decimal(price));
      toAmount = amount.mul(rate);
    }

    // Create the Conversion row FIRST, so the ledger entries below can
    // reference its real id — avoids ever writing a placeholder referenceId
    // that has to be patched later (the kind of loose end that caused the
    // ledger-amount bug documented in your handoff notes' §6.2).
    const conversion = await this.prisma.conversion.create({
      data: {
        userId,
        fromAsset,
        toAsset,
        fromAmount: amount,
        toAmount,
        rateUsed: rate,
        ledgerEntryIds: [],
      },
    });

    const debit = await this.ledger.postEntry({
      userId,
      asset: fromAsset,
      amount: amount.neg().toString(),
      entryType: LedgerEntryType.CONVERSION_OUT,
      referenceType: 'conversion',
      referenceId: conversion.id,
    });

    const credit = await this.ledger.postEntry({
      userId,
      asset: toAsset,
      amount: toAmount.toString(),
      entryType: LedgerEntryType.CONVERSION_IN,
      referenceType: 'conversion',
      referenceId: conversion.id,
    });

    return this.prisma.conversion.update({
      where: { id: conversion.id },
      data: { ledgerEntryIds: [debit.id, credit.id] },
    });
  }

  async listConversions(userId: string) {
    return this.prisma.conversion.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
