import { Test, TestingModule } from '@nestjs/testing';
import { LedgerService } from './ledger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

describe('LedgerService', () => {
  let service: LedgerService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      ledgerEntry: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LedgerService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<LedgerService>(LedgerService);
  });

  it('starts a new user/asset balance at zero and credits correctly', async () => {
    prismaMock.ledgerEntry.findFirst.mockResolvedValueOnce(null);
    prismaMock.ledgerEntry.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'entry-1', ...data }),
    );

    const result = await service.postEntry({
      userId: 'user-1',
      asset: 'USDT',
      amount: 100,
      entryType: 'DEPOSIT',
      referenceType: 'deposit_event',
      referenceId: 'dep-1',
    });

    expect(result.balanceAfter.toString()).toBe('100');
    expect(prismaMock.ledgerEntry.create).toHaveBeenCalledTimes(1);
  });

  it('computes balanceAfter cumulatively from the prior entry', async () => {
    prismaMock.ledgerEntry.findFirst.mockResolvedValueOnce({
      balanceAfter: new Prisma.Decimal(100),
    });
    prismaMock.ledgerEntry.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'entry-2', ...data }),
    );

    const result = await service.postEntry({
      userId: 'user-1',
      asset: 'USDT',
      amount: -40,
      entryType: 'WITHDRAWAL',
      referenceType: 'withdrawal_request',
      referenceId: 'wd-1',
    });

    expect(result.balanceAfter.toString()).toBe('60');
  });

  it('exposes no method that updates or deletes a ledger entry', () => {
    const publicMethods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(service),
    ).filter((m) => m !== 'constructor');

    expect(publicMethods).toEqual(
      expect.arrayContaining(['postEntry', 'getBalance', 'getHistory']),
    );
    expect(publicMethods.some((m) => /update|delete|remove/i.test(m))).toBe(false);
  });

  it('requires createdBy for ADMIN_ADJUSTMENT entries', async () => {
    await expect(
      service.postEntry({
        userId: 'user-1',
        asset: 'USDT',
        amount: 10,
        entryType: 'ADMIN_ADJUSTMENT',
        referenceType: 'admin_adjustment',
        referenceId: 'adj-1',
      }),
    ).rejects.toThrow('ADMIN_ADJUSTMENT entries require createdBy');
  });
});