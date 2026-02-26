/**
 * Fix Missing Escrow Addresses
 * 
 * Run with: npx ts-node src/scripts/fixMissingEscrows.ts
 * 
 * This script finds all challenges without escrow addresses and creates them.
 */

import prisma from '../lib/prisma';
import { escrowService } from '../services/escrowService';

async function fixMissingEscrows() {
  console.log('🔍 Finding challenges without escrow addresses...\n');

  // Find all challenges without escrow addresses
  const challengesWithoutEscrow = await prisma.challenge.findMany({
    where: {
      OR: [
        { escrowAddress: null },
        { escrowAddress: '' },
      ],
    },
    select: {
      id: true,
      title: true,
      startDate: true,
      stakeAmount: true,
    },
  });

  if (challengesWithoutEscrow.length === 0) {
    console.log('✅ All challenges have escrow addresses!');
    return;
  }

  console.log(`Found ${challengesWithoutEscrow.length} challenges without escrow:\n`);

  for (const challenge of challengesWithoutEscrow) {
    console.log(`  - ${challenge.title} (${challenge.id})`);
  }

  console.log('\n🔧 Creating escrow wallets...\n');

  let fixed = 0;
  let failed = 0;

  for (const challenge of challengesWithoutEscrow) {
    try {
      const escrowWallet = await escrowService.createEscrowWallet(challenge.id);
      console.log(`  ✅ ${challenge.title}: ${escrowWallet.publicKey}`);
      fixed++;
    } catch (error: any) {
      console.error(`  ❌ ${challenge.title}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Fixed: ${fixed}`);
  console.log(`   Failed: ${failed}`);
}

// Run the script
fixMissingEscrows()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
