import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TatumAdapter } from './adapters/tatum.adapter';

@Injectable()
export class WalletsService {
  constructor(
    private prisma: PrismaService,
    private walletAdapter: TatumAdapter,
  ) {}

  async getOrCreateAddress(userId: string, chain: string, asset: string) {
    const existing = await this.prisma.depositAddress.findUnique({
      where: { userId_chain_asset: { userId, chain, asset } },
    });
    if (existing) return existing;

    const result = await this.walletAdapter.createDepositAddress(userId, chain, asset);

    return this.prisma.depositAddress.create({
      data: {
        userId,
        chain,
        asset,
        address: result.address,
        providerRef: result.providerRef,
      },
    });
  }

  async listAddresses(userId: string) {
    return this.prisma.depositAddress.findMany({ where: { userId } });
  }
}