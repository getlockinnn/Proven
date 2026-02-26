/**
 * Check Challenges Script
 * Lists all challenges and their escrow status
 */

import prisma from '../lib/prisma';

async function checkChallenges() {
  console.log('🔍 Checking all challenges...\n');

  try {
    const challenges = await prisma.challenge.findMany({
      select: {
        id: true,
        title: true,
        escrowAddress: true,
        stakeAmount: true,
        participants: true,
        startDate: true,
        endDate: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`📊 Total challenges: ${challenges.length}\n`);

    if (challenges.length === 0) {
      console.log('No challenges found in database.');
      return;
    }

    let withEscrow = 0;
    let withoutEscrow = 0;

    console.log('='.repeat(80));
    challenges.forEach((challenge, index) => {
      console.log(`\n${index + 1}. ${challenge.title}`);
      console.log(`   ID: ${challenge.id}`);
      console.log(`   Stake: ${challenge.stakeAmount} USDC`);
      console.log(`   Participants: ${challenge.participants}`);
      console.log(`   Start: ${challenge.startDate?.toLocaleDateString() || 'Not set'}`);
      console.log(`   End: ${challenge.endDate?.toLocaleDateString() || 'Not set'}`);

      if (challenge.escrowAddress) {
        console.log(`   ✅ Escrow: ${challenge.escrowAddress}`);
        withEscrow++;
      } else {
        console.log(`   ❌ Escrow: NOT SET`);
        withoutEscrow++;
      }
      console.log('-'.repeat(80));
    });

    console.log('\n' + '='.repeat(80));
    console.log('📈 Summary:');
    console.log(`   Total: ${challenges.length}`);
    console.log(`   ✅ With escrow: ${withEscrow}`);
    console.log(`   ❌ Without escrow: ${withoutEscrow}`);
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkChallenges().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
