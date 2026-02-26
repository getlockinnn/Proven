import prisma from '../lib/prisma';
import { TransactionType } from '@prisma/client';

/**
 * One-time backfill script: populate UserChallenge.walletAddress
 * from the STAKE Transaction.metadata.userWalletAddress for existing records.
 *
 * Usage: npx ts-node src/scripts/backfillWalletAddresses.ts
 */
async function backfillWalletAddresses() {
  console.log('Starting wallet address backfill...');

  const userChallenges = await prisma.userChallenge.findMany({
    where: { walletAddress: null },
    select: { id: true, userId: true, challengeId: true },
  });

  console.log(`Found ${userChallenges.length} UserChallenges with no walletAddress`);

  let updated = 0;
  let skipped = 0;

  for (const uc of userChallenges) {
    const stakeTransaction = await prisma.transaction.findFirst({
      where: {
        userId: uc.userId,
        challengeId: uc.challengeId,
        transactionType: TransactionType.STAKE,
      },
    });

    if (!stakeTransaction?.metadata) {
      console.log(`  [SKIP] UserChallenge ${uc.id}: no stake transaction found`);
      skipped++;
      continue;
    }

    const metadata = stakeTransaction.metadata as any;
    const walletAddress = metadata.userWalletAddress;

    if (!walletAddress || walletAddress === 'unknown') {
      console.log(`  [SKIP] UserChallenge ${uc.id}: no valid wallet in metadata`);
      skipped++;
      continue;
    }

    await prisma.userChallenge.update({
      where: { id: uc.id },
      data: { walletAddress },
    });

    console.log(`  [OK] UserChallenge ${uc.id} -> ${walletAddress}`);
    updated++;
  }

  console.log(`\nBackfill complete: ${updated} updated, ${skipped} skipped`);
}

backfillWalletAddresses()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
