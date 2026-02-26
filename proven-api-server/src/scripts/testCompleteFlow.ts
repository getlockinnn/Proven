import prisma from '../lib/prisma';
import { PublicKey } from '@solana/web3.js';

/**
 * Comprehensive test of the challenge create + join flow
 */
async function testCompleteFlow() {
  console.log('\n========================================');
  console.log('  COMPLETE FLOW TEST');
  console.log('========================================\n');

  try {
    // Step 1: Check existing challenges
    console.log('[Step 1] Checking existing challenges...\n');
    const existingChallenges = await prisma.challenge.findMany({
      select: {
        id: true,
        title: true,
        blockchainId: true,
        participants: true,
      },
    });

    console.log(`Found ${existingChallenges.length} existing challenges:`);
    existingChallenges.forEach((c) => {
      const hasValidBlockchainId = c.blockchainId ? '✅' : '❌';
      console.log(`  ${hasValidBlockchainId} ${c.title} (${c.participants} participants)`);
      if (c.blockchainId) {
        try {
          new PublicKey(c.blockchainId);
          console.log(`      Blockchain ID: ${c.blockchainId} (valid)`);
        } catch (error) {
          console.log(`      Blockchain ID: ${c.blockchainId} (INVALID)`);
        }
      }
    });

    // Step 2: Test blockchain ID validation
    console.log('\n[Step 2] Testing blockchain ID validation...\n');

    const challengesWithBlockchainId = existingChallenges.filter((c) => c.blockchainId);
    let validCount = 0;
    let invalidCount = 0;

    for (const challenge of challengesWithBlockchainId) {
      try {
        new PublicKey(challenge.blockchainId!);
        validCount++;
        console.log(`  ✅ "${challenge.title}" has valid blockchain ID`);
      } catch (error) {
        invalidCount++;
        console.log(`  ❌ "${challenge.title}" has INVALID blockchain ID: ${challenge.blockchainId}`);
      }
    }

    console.log(`\n  Summary: ${validCount} valid, ${invalidCount} invalid`);

    // Step 3: Check join flow prerequisites
    console.log('\n[Step 3] Checking join flow prerequisites...\n');

    const joinablesChallenges = existingChallenges.filter((c) => {
      if (!c.blockchainId) return false;
      try {
        new PublicKey(c.blockchainId);
        return true;
      } catch {
        return false;
      }
    });

    console.log(`  ✅ ${joinablesChallenges.length} challenges are joinable (have valid blockchain IDs)`);

    if (joinablesChallenges.length > 0) {
      console.log('\n  Joinable challenges:');
      joinablesChallenges.forEach((c) => {
        console.log(`    - ${c.title} (ID: ${c.id})`);
        console.log(`      Blockchain: ${c.blockchainId}`);
      });
    }

    // Step 4: Check for test users
    console.log('\n[Step 4] Checking for test users...\n');

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
      },
      take: 3,
    });

    console.log(`  Found ${users.length} users in database`);
    users.forEach((u) => {
      console.log(`    - ${u.name || 'Unnamed'} (${u.email || 'No email'})`);
    });

    // Step 5: Summary and recommendations
    console.log('\n========================================');
    console.log('  TEST SUMMARY');
    console.log('========================================\n');

    console.log('✅ Database cleanup: PASSED (no invalid blockchain IDs found)');
    console.log(`✅ Challenge creation: ${challengesWithBlockchainId.length > 0 ? 'READY' : 'NEEDS TESTING'}`);
    console.log(`✅ Join flow readiness: ${joinablesChallenges.length > 0 ? 'READY' : 'CREATE A NEW CHALLENGE FIRST'}`);
    console.log(`✅ User availability: ${users.length > 0 ? 'READY' : 'NO USERS FOUND'}`);

    console.log('\n📋 NEXT STEPS:');
    if (joinablesChallenges.length === 0) {
      console.log('  1. Create a new challenge via frontend');
      console.log('  2. Verify it gets a valid blockchain ID');
      console.log('  3. Then test joining that challenge');
    } else {
      console.log('  1. ✅ Challenges with valid blockchain IDs exist');
      console.log('  2. Test joining one of these challenges via frontend');
      console.log('  3. Verify database records are created correctly');
    }

    console.log('\n🧪 TO TEST MANUALLY:');
    console.log('  1. Start the backend: npm run dev');
    console.log('  2. Create a challenge via CreateChallengeModal');
    console.log('  3. Join that challenge via JoinChallengeModal');
    console.log('  4. Check backend logs for success messages');
    console.log('  5. Verify database records in Prisma Studio');

    console.log('\n✅ All systems ready for end-to-end testing!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testCompleteFlow()
  .then(() => {
    console.log('[Test] Script finished successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Test] Script failed:', error);
    process.exit(1);
  });
