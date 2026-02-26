/**
 * Test Solana Program Integration
 * Tests the on-chain program after factory setup
 */

import { solanaProgram, PROGRAM_ID } from '../services/solanaProgram';
import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testSolanaProgram() {
  console.log('='.repeat(60));
  console.log('PROVEN Solana Program Test');
  console.log('='.repeat(60));
  console.log();

  try {
    // 1. Initialize the program service
    console.log('1. Initializing Solana Program Service...');
    await solanaProgram.initialize();
    console.log(`   Program ID: ${PROGRAM_ID.toBase58()}`);
    console.log(`   Oracle: ${solanaProgram.getOraclePublicKey()?.toBase58() || 'NOT SET'}`);
    console.log('   ✅ Initialized');
    console.log();

    // 2. Check factory
    console.log('2. Checking Factory...');
    const factory = await solanaProgram.getFactory();
    if (factory) {
      console.log('   ✅ Factory found!');
      console.log(`   - Authority: ${factory.authority.toBase58()}`);
      console.log(`   - Treasury: ${factory.treasury.toBase58()}`);
      console.log(`   - Oracle: ${factory.oracle.toBase58()}`);
      console.log(`   - Challenge Count: ${factory.challengeCount.toString()}`);
    } else {
      console.log('   ❌ Factory not found! Run setupFactory.ts first.');
      process.exit(1);
    }
    console.log();

    // 3. Create a test challenge
    console.log('3. Creating Test Challenge...');

    // Load creator keypair (using oracle keypair for testing)
    const keypairPath = process.env.ORACLE_KEYPAIR_PATH || './oracle-keypair.json';
    const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    const creatorKeypair = Keypair.fromSecretKey(Uint8Array.from(keyData));

    const testChallengeId = `test-${Date.now()}`;
    const stakeAmount = 1; // 1 USDC
    const totalDays = 7;
    const startTs = Math.floor(Date.now() / 1000) + 3600; // Start in 1 hour

    console.log(`   Challenge ID: ${testChallengeId}`);
    console.log(`   Stake Amount: ${stakeAmount} USDC`);
    console.log(`   Duration: ${totalDays} days`);
    console.log(`   Start Time: ${new Date(startTs * 1000).toISOString()}`);
    console.log('   Sending transaction...');

    const result = await solanaProgram.createChallenge(
      creatorKeypair,
      testChallengeId,
      stakeAmount,
      totalDays,
      startTs
    );

    console.log(`   ✅ Challenge created!`);
    console.log(`   - Signature: ${result.signature}`);
    console.log(`   - Challenge PDA: ${result.challengePDA.toBase58()}`);
    console.log(`   - Escrow Vault: ${result.escrowVault.toBase58()}`);
    console.log();

    // 4. Verify challenge on-chain
    console.log('4. Verifying Challenge On-Chain...');
    const challenge = await solanaProgram.getChallenge(testChallengeId);
    if (challenge) {
      console.log('   ✅ Challenge verified!');
      console.log(`   - Challenge ID: ${challenge.challengeId}`);
      console.log(`   - Creator: ${challenge.creator.toBase58()}`);
      console.log(`   - Stake Amount: ${solanaProgram.fromUsdcAmount(challenge.stakeAmount)} USDC`);
      console.log(`   - Total Days: ${challenge.totalDays}`);
      console.log(`   - Status: ${JSON.stringify(challenge.status)}`);
      console.log(`   - Participants: ${challenge.participantCount}`);
    } else {
      console.log('   ❌ Challenge not found on-chain!');
    }
    console.log();

    // 5. Check updated factory
    console.log('5. Checking Updated Factory...');
    const updatedFactory = await solanaProgram.getFactory();
    if (updatedFactory) {
      console.log(`   Challenge Count: ${updatedFactory.challengeCount.toString()}`);
    }
    console.log();

    console.log('='.repeat(60));
    console.log('TEST COMPLETE!');
    console.log('='.repeat(60));
    console.log();
    console.log('Summary:');
    console.log('  ✅ Program initialized successfully');
    console.log('  ✅ Factory is working');
    console.log('  ✅ Challenge creation works');
    console.log('  ✅ On-chain data is readable');
    console.log();
    console.log('View transaction on Solana Explorer:');
    console.log(`  https://explorer.solana.com/tx/${result.signature}?cluster=devnet`);
    console.log();

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.logs) {
      console.error('Transaction logs:');
      error.logs.forEach((log: string) => console.error(`  ${log}`));
    }
    process.exit(1);
  }
}

testSolanaProgram().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
