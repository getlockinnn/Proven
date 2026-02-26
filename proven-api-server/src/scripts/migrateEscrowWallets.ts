/**
 * Migration Script: Add Escrow Wallets to Existing Challenges
 *
 * This script generates escrow wallets for all challenges that don't have one.
 * Run with: npx ts-node src/scripts/migrateEscrowWallets.ts
 */

import prisma from '../lib/prisma';
import { escrowService } from '../services/escrowService';

async function migrateEscrowWallets() {
  console.log('🔄 Starting escrow wallet migration...\n');

  try {
    // Get all challenges without escrow addresses
    const challengesWithoutEscrow = await prisma.challenge.findMany({
      where: {
        OR: [
          { escrowAddress: null },
          { escrowAddress: '' }
        ]
      },
      select: {
        id: true,
        title: true,
        createdAt: true
      }
    });

    console.log(`📊 Found ${challengesWithoutEscrow.length} challenges without escrow wallets\n`);

    if (challengesWithoutEscrow.length === 0) {
      console.log('✅ All challenges already have escrow wallets!');
      return;
    }

    // Process each challenge
    let successCount = 0;
    let failCount = 0;

    for (const challenge of challengesWithoutEscrow) {
      try {
        console.log(`\n🔧 Processing: ${challenge.title}`);
        console.log(`   Challenge ID: ${challenge.id}`);

        // Create escrow wallet
        const escrowWallet = await escrowService.createEscrowWallet(challenge.id);

        // Update database
        await prisma.challenge.update({
          where: { id: challenge.id },
          data: { escrowAddress: escrowWallet.publicKey }
        });

        console.log(`   ✅ Escrow created: ${escrowWallet.publicKey}`);
        successCount++;

      } catch (error: any) {
        console.error(`   ❌ Failed: ${error.message}`);
        failCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 Migration Summary:');
    console.log(`   Total challenges: ${challengesWithoutEscrow.length}`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log('='.repeat(60) + '\n');

    if (failCount === 0) {
      console.log('🎉 Migration completed successfully!');
    } else {
      console.log('⚠️  Migration completed with some failures. Check logs above.');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateEscrowWallets()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
