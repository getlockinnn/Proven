/**
 * Test Challenge API Response
 * Simulates what the frontend will see
 */

import prisma from '../lib/prisma';

async function testChallengeAPI() {
  console.log('🧪 Testing Challenge API Response...\n');

  try {
    // Get the challenge from DB (simulating the API endpoint logic)
    const challenge = await prisma.challenge.findFirst({
      where: {},
      include: {
        creator: true
      }
    });

    if (!challenge) {
      console.log('❌ No challenges found in database');
      return;
    }

    // Transform exactly as the API does
    const apiResponse = {
      id: challenge.id,
      title: challenge.title,
      type: challenge.verificationType,
      sponsor: challenge.sponsor || challenge.creator?.name || '',
      hostType: challenge.hostType || '',
      duration: `${Math.ceil((challenge.endDate.getTime() - challenge.startDate.getTime()) / (1000 * 60 * 60 * 24))} days`,
      difficulty: challenge.difficulty,
      userStake: challenge.stakeAmount,
      stakeAmount: challenge.stakeAmount,
      totalPrizePool: challenge.totalPrizePool,
      participants: challenge.participants || 0,
      metrics: challenge.metrics,
      trackingMetrics: challenge.trackingMetrics || challenge.rules || [],
      image: challenge.image,
      description: challenge.description || '',
      rules: challenge.rules || [],
      startDate: challenge.startDate.toISOString(),
      endDate: challenge.endDate.toISOString(),
      escrowAddress: challenge.escrowAddress || undefined,
      tokenType: 'USDC' as const,
      creator: {
        id: challenge.creator?.id || '',
        name: challenge.creator?.name || '',
        image: challenge.creator?.image || ''
      }
    };

    console.log('📦 API Response (what frontend will see):');
    console.log('='.repeat(80));
    console.log(JSON.stringify(apiResponse, null, 2));
    console.log('='.repeat(80));

    console.log('\n🔍 Key Fields Check:');
    console.log(`   Challenge ID: ${apiResponse.id}`);
    console.log(`   Title: ${apiResponse.title}`);
    console.log(`   Stake Amount: ${apiResponse.stakeAmount} USDC`);

    if (apiResponse.escrowAddress) {
      console.log(`   ✅ Escrow Address: ${apiResponse.escrowAddress}`);
      console.log('\n✅ SUCCESS: escrowAddress is present in API response');
      console.log('   Frontend will now be able to initiate real USDC transfers!');
    } else {
      console.log(`   ❌ Escrow Address: NOT SET`);
      console.log('\n❌ ISSUE: escrowAddress is missing - V2 transfers will not work');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testChallengeAPI().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
