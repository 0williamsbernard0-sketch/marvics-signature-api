import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerEntryType, Prisma } from '@prisma/client';

@Injectable()
export class TransferService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
  ) {}

  async transfer(senderId: string, recipientEmail: string, asset: string, amountStr: string) {
    const amount = new Prisma.Decimal(amountStr);

    const recipient = await this.prisma.user.findUnique({ where: { email: recipientEmail } });
    if (!recipient) {
      throw new NotFoundException(`No user found with email ${recipientEmail}`);
    }
    if (recipient.id === senderId) {
      throw new BadRequestException('Cannot transfer to yourself');
    }

    const balance = await this.ledger.getBalance(senderId, asset);
    if (balance.lt(amount)) {
      throw new BadRequestException(`Insufficient ${asset} balance`);
    }

    // Same pattern as ConversionService: create the InternalTransfer row
    // first, so both ledger entries can reference its real id directly —
    // no placeholder referenceId, no follow-up patch step to forget.
    const transfer = await this.prisma.internalTransfer.create({
      data: {
        senderId,
        recipientId: recipient.id,
        asset,
        amount,
        ledgerEntryIds: [],
      },
    });

    const debit = await this.ledger.postEntry({
      userId: senderId,
      asset,
      amount: amount.neg().toString(),
      entryType: LedgerEntryType.TRANSFER_OUT,
      referenceType: 'internal_transfer',
      referenceId: transfer.id,
    });

    const credit = await this.ledger.postEntry({
      userId: recipient.id,
      asset,
      amount: amount.toString(),
      entryType: LedgerEntryType.TRANSFER_IN,
      referenceType: 'internal_transfer',
      referenceId: transfer.id,
    });

    return this.prisma.internalTransfer.update({
      where: { id: transfer.id },
      data: { ledgerEntryIds: [debit.id, credit.id] },
    });
  }

  async listTransfers(userId: string) {
    return this.prisma.internalTransfer.findMany({
      where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      orderBy: { createdAt: 'desc' },
    });
  }
}
