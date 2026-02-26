import prisma from '../lib/prisma';
import { PublicKey } from '@solana/web3.js';

/**
 * Cleanup script to remove challenges with invalid blockchain IDs
 * This removes old challenges created with temporary mock data (TEMP_PDA_xxx)
 */
async function cleanupInvalidChallenges() {
  try {
    console.log('[Cleanup] Starting cleanup of invalid challenges...');

    // Fetch all challenges
    const allChallenges = await prisma.challenge.findMany({
      select: {
        id: true,
        blockchainId: true,
        title: true,
        createdAt: true,
      },
    });

    console.log(`[Cleanup] Found ${allChallenges.length} total challenges`);

    const invalidChallenges = [];

    // Check each challenge for invalid blockchainId
    for (const challenge of allChallenges) {
      if (!challenge.blockchainId) {
        console.log(`[Cleanup] Challenge "${challenge.title}" has no blockchainId - keeping it`);
        continue;
      }

      // Check if it starts with TEMP_PDA_ (old mock format)
      if (challenge.blockchainId.startsWith('TEMP_PDA_')) {
        console.log(`[Cleanup] ❌ Invalid: "${challenge.title}" - blockchainId: ${challenge.blockchainId}`);
        invalidChallenges.push(challenge.id);
        continue;
      }

      // Try to parse as valid Solana PublicKey
      try {
        new PublicKey(challenge.blockchainId);
        console.log(`[Cleanup] ✅ Valid: "${challenge.title}" - blockchainId: ${challenge.blockchainId}`);
      } catch (error) {
        console.log(`[Cleanup] ❌ Invalid: "${challenge.title}" - blockchainId: ${challenge.blockchainId}`);
        invalidChallenges.push(challenge.id);
      }
    }

    if (invalidChallenges.length === 0) {
      console.log('[Cleanup] ✅ No invalid challenges found! Database is clean.');
      return;
    }

    console.log(`\n[Cleanup] Found ${invalidChallenges.length} invalid challenges to delete`);

    // Delete related records first (due to foreign key constraints)
    const deletedSubmissions = await prisma.submission.deleteMany({
      where: {
        challengeId: {
          in: invalidChallenges,
        },
      },
    });

    const deletedTransactions = await prisma.transaction.deleteMany({
      where: {
        challengeId: {
          in: invalidChallenges,
        },
      },
    });

    const deletedUserChallenges = await prisma.userChallenge.deleteMany({
      where: {
        challengeId: {
          in: invalidChallenges,
        },
      },
    });

    // Delete the challenges themselves
    const deletedChallenges = await prisma.challenge.deleteMany({
      where: {
        id: {
          in: invalidChallenges,
        },
      },
    });

    console.log('\n[Cleanup] ✅ Cleanup complete!');
    console.log(`  - Deleted ${deletedSubmissions.count} submissions`);
    console.log(`  - Deleted ${deletedTransactions.count} transactions`);
    console.log(`  - Deleted ${deletedUserChallenges.count} user challenges`);
    console.log(`  - Deleted ${deletedChallenges.count} challenges`);
  } catch (error) {
    console.error('[Cleanup] ❌ Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupInvalidChallenges()
  .then(() => {
    console.log('\n[Cleanup] Script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n[Cleanup] Script failed:', error);
    process.exit(1);
  });
