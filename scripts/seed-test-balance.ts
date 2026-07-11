/**
 * scripts/seed-test-balance.ts
 *
 * One-off dev utility — NOT part of the app's runtime code, NOT wired into
 * any module, NOT reachable via any HTTP route. Run manually from the CLI
 * only. Safe for testnet; delete or gate behind NODE_ENV !== 'production'
 * before mainnet so nobody accidentally leaves a balance-minting script
 * lying around.
 *
 * Usage:
 *   npx ts-node scripts/seed-test-balance.ts <email> <asset> <amount>
 *
 * Example:
 *   npx ts-node scripts/seed-test-balance.ts mavelpaul2@gmail.com USDT 100
 */

import { PrismaClient, LedgerEntryType, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [, , email, asset, amountStr] = process.argv;

  if (!email || !asset || !amountStr) {
    console.error('Usage: npx ts-node scripts/seed-test-balance.ts <email> <asset> <amount>');
    process.exit(1);
  }

  const amount = new Prisma.Decimal(amountStr);
  if (amount.lte(0)) {
    console.error('Amount must be positive.');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  // Mirror LedgerService's balance derivation: latest entry's balanceAfter
  // for this user+asset, defaulting to 0 if none exists yet.
  const lastEntry = await prisma.ledgerEntry.findFirst({
    where: { userId: user.id, asset },
    orderBy: { createdAt: 'desc' },
  });

  const previousBalance = lastEntry ? lastEntry.balanceAfter : new Prisma.Decimal(0);
  const newBalance = previousBalance.add(amount);

  const entry = await prisma.ledgerEntry.create({
    data: {
      userId: user.id,
      asset,
      amount,
      entryType: LedgerEntryType.ADMIN_ADJUSTMENT,
      referenceType: 'manual_test_seed',
      referenceId: `seed-${Date.now()}`,
      balanceAfter: newBalance,
      createdBy: user.id, // no separate admin actor for this manual dev seed
    },
  });

  console.log(`✅ Credited ${amount.toString()} ${asset} to ${email}`);
  console.log(`   New balance: ${newBalance.toString()} ${asset}`);
  console.log(`   LedgerEntry id: ${entry.id}`);
}

main()
  .catch((err) => {
    console.error('Failed to seed balance:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
