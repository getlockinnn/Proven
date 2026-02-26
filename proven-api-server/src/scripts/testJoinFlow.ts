import prisma from '../lib/prisma';

/**
 * Test script to verify the join flow setup
 * Checks current challenges and their blockchain IDs
 */
async function testJoinFlow() {
  try {
    console.log('\n[Test] Checking current challenges...\n');

    const challenges = await prisma.challenge.findMany({
      select: {
        id: true,
        title: true,
        blockchainId: true,
        transactionSignature: true,
        stakeAmount: true,
        participants: true,
        createdAt: true,
        userChallenges: {
          select: {
            id: true,
            userId: true,
            status: true,
            stakeAmount: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`Found ${challenges.length} challenges:\n`);

    challenges.forEach((challenge, index) => {
      console.log(`${index + 1}. ${challenge.title}`);
      console.log(`   ID: ${challenge.id}`);
      console.log(`   Blockchain ID: ${challenge.blockchainId || 'None'}`);
      console.log(`   Transaction Sig: ${challenge.transactionSignature || 'None'}`);
      console.log(`   Stake Amount: ${challenge.stakeAmount} USDC`);
      console.log(`   Participants: ${challenge.participants}`);
      console.log(`   User Challenges: ${challenge.userChallenges.length}`);
      console.log('');
    });

    // Check for valid blockchain IDs
    const validChallenges = challenges.filter((c) => {
      if (!c.blockchainId) return false;
      try {
        // Simple check: valid Solana address is 32-44 chars, base58
        return c.blockchainId.length >= 32 && c.blockchainId.length <= 44;
      } catch {
        return false;
      }
    });

    console.log(`✅ ${validChallenges.length}/${challenges.length} challenges have valid blockchain IDs`);

    // Summary
    console.log('\n[Test] Summary:');
    console.log(`  - Total challenges: ${challenges.length}`);
    console.log(`  - With valid blockchain IDs: ${validChallenges.length}`);
    console.log(`  - Ready for join flow: ${validChallenges.length}`);

    if (validChallenges.length > 0) {
      console.log('\n✅ Join flow should work for these challenges!');
    } else {
      console.log('\n⚠️  Create a new challenge to test the join flow');
    }
  } catch (error) {
    console.error('[Test] ❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testJoinFlow()
  .then(() => {
    console.log('\n[Test] Script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n[Test] Script failed:', error);
    process.exit(1);
  });
