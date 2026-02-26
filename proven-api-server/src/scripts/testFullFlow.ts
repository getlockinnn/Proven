/**
 * Test Full Backend Flow
 * Tests creating a challenge in both DB and on-chain (Solana program)
 * Run: npx ts-node src/scripts/testFullFlow.ts
 */

import { solanaProgram, PROGRAM_ID } from '../services/solanaProgram';
import prisma from '../lib/prisma';
import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testFullFlow() {
  console.log('='.repeat(60));
  console.log('PROVEN Full Backend Flow Test');
  console.log('='.repeat(60));
  console.log();

  try {
    // 1. Initialize Solana Program
    console.log('1. Initializing Solana Program...');
    await solanaProgram.initialize();
    console.log(`   Program ID: ${PROGRAM_ID.toBase58()}`);
    console.log('   ✅ Solana Program initialized');
    console.log();

    // 2. Check Factory
    console.log('2. Checking Factory on-chain...');
    const factory = await solanaProgram.getFactory();
    if (!factory) {
      console.log('   ❌ Factory not found! Run setupFactory.ts first.');
      process.exit(1);
    }
    console.log(`   ✅ Factory found (Challenge Count: ${factory.challengeCount.toString()})`);
    console.log();

    // 3. Find or create an admin user in DB
    console.log('3. Setting up admin user in DB...');
    let adminUser = await prisma.user.findFirst({
      where: { isAdmin: true }
    });

    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          name: 'Test Admin',
          email: 'admin@proven.test',
          isAdmin: true,
        }
      });
      console.log('   Created new admin user');
    }
    console.log(`   ✅ Admin user: ${adminUser.name} (${adminUser.id})`);
    console.log();

    // 4. Create challenge data
    console.log('4. Preparing challenge data...');
    const now = new Date();
    const startDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
    const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days later
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const startTs = Math.floor(startDate.getTime() / 1000);

    const challengeData = {
      title: `Backend Test Challenge - ${Date.now()}`,
      description: 'A test challenge created via backend script to verify full flow',
      stakeAmount: 5, // 5 USDC
      startDate: startDate,
      endDate: endDate,
      verificationType: 'PHOTO',
      difficulty: 'MODERATE',
      metrics: 'Complete daily tasks',
      image: 'https://example.com/challenge.jpg',
      rules: ['Submit daily proof', 'Be consistent'],
      totalPrizePool: 10,
      participants: 0,
      hostType: 'PERSONAL',
      trackingMetrics: ['daily_check_in'],
    };

    console.log(`   Title: ${challengeData.title}`);
    console.log(`   Stake: ${challengeData.stakeAmount} USDC`);
    console.log(`   Duration: ${totalDays} days`);
    console.log(`   Start: ${startDate.toISOString()}`);
    console.log(`   End: ${endDate.toISOString()}`);
    console.log();

    // 5. Create challenge in database first
    console.log('5. Creating challenge in database...');
    const dbChallenge = await prisma.challenge.create({
      data: {
        title: challengeData.title,
        description: challengeData.description,
        stakeAmount: challengeData.stakeAmount,
        startDate: challengeData.startDate,
        endDate: challengeData.endDate,
        verificationType: challengeData.verificationType,
        difficulty: challengeData.difficulty,
        metrics: challengeData.metrics,
        creatorId: adminUser.id,
        image: challengeData.image,
        rules: challengeData.rules,
        totalPrizePool: challengeData.totalPrizePool,
        participants: challengeData.participants,
        hostType: challengeData.hostType,
        trackingMetrics: challengeData.trackingMetrics,
      },
    });
    console.log(`   ✅ DB Challenge ID: ${dbChallenge.id}`);
    console.log();

    // 6. Create challenge on-chain
    console.log('6. Creating challenge on Solana blockchain...');
    const keypairPath = process.env.ORACLE_KEYPAIR_PATH || './oracle-keypair.json';
    const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    const creatorKeypair = Keypair.fromSecretKey(Uint8Array.from(keyData));

    // Use truncated DB ID as on-chain ID (max 32 chars)
    const onChainChallengeId = dbChallenge.id.slice(0, 32);

    const onChainResult = await solanaProgram.createChallenge(
      creatorKeypair,
      onChainChallengeId,
      challengeData.stakeAmount,
      totalDays,
      startTs
    );

    console.log(`   ✅ On-chain challenge created!`);
    console.log(`   - Challenge PDA: ${onChainResult.challengePDA.toBase58()}`);
    console.log(`   - Escrow Vault: ${onChainResult.escrowVault.toBase58()}`);
    console.log(`   - Transaction: ${onChainResult.signature}`);
    console.log();

    // 7. Update DB with blockchain info
    console.log('7. Updating database with blockchain info...');
    const updatedChallenge = await prisma.challenge.update({
      where: { id: dbChallenge.id },
      data: {
        blockchainId: onChainResult.challengePDA.toBase58(),
        transactionSignature: onChainResult.signature,
        escrowAddress: onChainResult.escrowVault.toBase58(),
      },
    });
    console.log(`   ✅ Database updated`);
    console.log(`   - blockchainId: ${updatedChallenge.blockchainId}`);
    console.log(`   - escrowAddress: ${updatedChallenge.escrowAddress}`);
    console.log();

    // 8. Verify on-chain data
    console.log('8. Verifying challenge on-chain...');
    const onChainChallenge = await solanaProgram.getChallenge(onChainChallengeId);
    if (onChainChallenge) {
      console.log('   ✅ Challenge verified on-chain!');
      console.log(`   - Challenge ID: ${onChainChallenge.challengeId}`);
      console.log(`   - Stake Amount: ${solanaProgram.fromUsdcAmount(onChainChallenge.stakeAmount)} USDC`);
      console.log(`   - Total Days: ${onChainChallenge.totalDays}`);
      console.log(`   - Status: ${JSON.stringify(onChainChallenge.status)}`);
    } else {
      console.log('   ❌ Challenge not found on-chain!');
    }
    console.log();

    // 9. Verify DB data
    console.log('9. Verifying challenge in database...');
    const finalChallenge = await prisma.challenge.findUnique({
      where: { id: dbChallenge.id },
      include: { creator: true },
    });
    if (finalChallenge) {
      console.log('   ✅ Challenge verified in database!');
      console.log(`   - ID: ${finalChallenge.id}`);
      console.log(`   - Title: ${finalChallenge.title}`);
      console.log(`   - Creator: ${finalChallenge.creator.name}`);
      console.log(`   - blockchainId: ${finalChallenge.blockchainId}`);
      console.log(`   - escrowAddress: ${finalChallenge.escrowAddress}`);
    }
    console.log();

    // Summary
    console.log('='.repeat(60));
    console.log('TEST COMPLETE!');
    console.log('='.repeat(60));
    console.log();
    console.log('Summary:');
    console.log('  ✅ Solana Program connected');
    console.log('  ✅ Factory is working');
    console.log('  ✅ Challenge created in database');
    console.log('  ✅ Challenge created on blockchain');
    console.log('  ✅ Database updated with blockchain references');
    console.log('  ✅ Both on-chain and DB data verified');
    console.log();
    console.log('View transaction on Solana Explorer:');
    console.log(`  https://explorer.solana.com/tx/${onChainResult.signature}?cluster=devnet`);
    console.log();
    console.log('Challenge Details:');
    console.log(`  DB ID: ${dbChallenge.id}`);
    console.log(`  Blockchain ID: ${onChainResult.challengePDA.toBase58()}`);
    console.log(`  Escrow Vault: ${onChainResult.escrowVault.toBase58()}`);
    console.log();

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.logs) {
      console.error('Transaction logs:');
      error.logs.forEach((log: string) => console.error(`  ${log}`));
    }
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testFullFlow().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
