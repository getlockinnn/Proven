/**
 * Production diagnostic: Check why payout jobs are failing
 *
 * Run ON the production server:
 *   npx ts-node src/scripts/diagnosePayout.ts
 *
 * Requires: DATABASE_URL, ESCROW_ENCRYPTION_KEY, SOLANA_RPC_URL, USDC_MINT in env
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import crypto from 'crypto';
import fs from 'fs';
import prisma from '../lib/prisma';

function loadOracleKeypair(): Keypair {
  const json = process.env.ORACLE_KEYPAIR_JSON;
  if (json) return Keypair.fromSecretKey(new Uint8Array(JSON.parse(json)));
  const filePath = process.env.ORACLE_KEYPAIR_PATH || './oracle-keypair.json';
  const data = fs.readFileSync(filePath, 'utf-8');
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(data)));
}

const RECIPIENT = 'J8yCaC1vajmfB3hnyTfWudnVs5iRePW8KZZSEU1pXzQs';
const TEST_AMOUNT = 0.001; // 0.001 USDC test transfer

async function main() {
  const connection = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed');
  const USDC_MINT = new PublicKey(process.env.USDC_MINT!);

  console.log('\n========================================');
  console.log('  PAYOUT DIAGNOSTICS');
  console.log('========================================\n');

  // 1. Check payout jobs
  console.log('=== 1. Payout Job Status ===');
  const jobs = await prisma.payoutJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      user: { select: { id: true, name: true, walletAddress: true } },
      challenge: { select: { id: true, title: true, escrowAddress: true } },
    },
  });

  if (jobs.length === 0) {
    console.log('No payout jobs found!');
    await prisma.$disconnect();
    return;
  }

  for (const job of jobs) {
    console.log(`  Job ${job.id.slice(0, 8)}... | ${job.status} | ${job.type} | $${(job.amount / 1_000_000).toFixed(6)} | attempts: ${job.attempts}`);
    console.log(`    wallet: ${job.walletAddress || 'MISSING'} | day: ${job.dayDate}`);
    if (job.lastError) console.log(`    error: ${job.lastError}`);
    console.log();
  }

  // 2. Check escrow wallet for the challenge
  const challengeId = jobs[0]?.challengeId;
  if (!challengeId) {
    console.log('No challenge found on jobs');
    await prisma.$disconnect();
    return;
  }

  console.log(`=== 2. Escrow Wallet for Challenge ===`);
  const escrow = await prisma.escrowWallet.findUnique({
    where: { challengeId },
  });

  if (!escrow) {
    console.error(`  NO ESCROW WALLET for challenge ${challengeId}!`);
    await prisma.$disconnect();
    return;
  }
  console.log(`  Escrow address: ${escrow.publicKey}`);

  // 3. Check escrow SOL balance
  console.log('\n=== 3. Escrow SOL Balance ===');
  const escrowPubkey = new PublicKey(escrow.publicKey);
  const solBalance = await connection.getBalance(escrowPubkey);
  console.log(`  SOL: ${solBalance / LAMPORTS_PER_SOL}`);
  if (solBalance < 0.005 * LAMPORTS_PER_SOL) {
    console.error('  *** PROBLEM: Escrow has insufficient SOL for tx fees!');
    console.error('  *** Solution: Send ~0.05 SOL to the escrow address');
  }

  // 4. Check escrow USDC balance
  console.log('\n=== 4. Escrow USDC Balance ===');
  try {
    const escrowAta = await getAssociatedTokenAddress(USDC_MINT, escrowPubkey);
    const balance = await connection.getTokenAccountBalance(escrowAta);
    console.log(`  USDC: ${balance.value.uiAmountString}`);

    const totalQueued = jobs
      .filter(j => j.status === 'QUEUED' || j.status === 'FAILED')
      .reduce((sum, j) => sum + j.amount, 0);
    console.log(`  Queued+Failed payouts need: ${(totalQueued / 1_000_000).toFixed(6)} USDC`);

    const available = parseFloat(balance.value.uiAmountString || '0');
    if (available < totalQueued / 1_000_000) {
      console.error('  *** PROBLEM: Insufficient USDC to cover all pending payouts!');
    }
  } catch (e: any) {
    console.error(`  *** PROBLEM: Cannot read escrow USDC balance: ${e.message}`);
    console.error('  *** The escrow may not have a USDC token account');
  }

  // 5. Try to decrypt escrow keypair
  console.log('\n=== 5. Escrow Key Decryption ===');
  let escrowKeypair: Keypair | null = null;
  try {
    const encKey = process.env.ESCROW_ENCRYPTION_KEY;
    if (!encKey) throw new Error('ESCROW_ENCRYPTION_KEY not set');

    const [ivHex, encryptedHex] = escrow.secretKey.split(':');
    const key = crypto.createHash('sha256').update(encKey).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);
    escrowKeypair = Keypair.fromSecretKey(new Uint8Array(decrypted));

    if (escrowKeypair.publicKey.toBase58() !== escrow.publicKey) {
      console.error('  *** PROBLEM: Decrypted key does NOT match stored public key!');
      console.error(`  *** Stored: ${escrow.publicKey}`);
      console.error(`  *** Decrypted: ${escrowKeypair.publicKey.toBase58()}`);
      escrowKeypair = null;
    } else {
      console.log('  Decryption successful! Key matches public key.');
    }
  } catch (e: any) {
    console.error(`  *** PROBLEM: Cannot decrypt escrow key: ${e.message}`);
    console.error('  *** Likely ESCROW_ENCRYPTION_KEY is wrong or was rotated');
  }

  // 6. Check recipient
  console.log('\n=== 6. Recipient Check ===');
  const recipientPubkey = new PublicKey(RECIPIENT);
  try {
    const recipientAta = await getAssociatedTokenAddress(USDC_MINT, recipientPubkey);
    const recipientBalance = await connection.getTokenAccountBalance(recipientAta);
    console.log(`  Recipient: ${RECIPIENT}`);
    console.log(`  USDC ATA: ${recipientAta.toBase58()}`);
    console.log(`  USDC balance: ${recipientBalance.value.uiAmountString}`);
  } catch {
    console.log(`  Recipient ${RECIPIENT} has no USDC account yet (will be created)`);
  }

  // 7. Test transfer (if we decrypted the key)
  if (escrowKeypair) {
    console.log(`\n=== 7. Test Transfer (${TEST_AMOUNT} USDC) — Oracle as fee payer ===`);
    try {
      const oracle = loadOracleKeypair();
      console.log(`  Oracle (fee payer): ${oracle.publicKey.toBase58()}`);
      const oracleSol = await connection.getBalance(oracle.publicKey);
      console.log(`  Oracle SOL: ${oracleSol / LAMPORTS_PER_SOL}`);

      const escrowAta = await getAssociatedTokenAddress(USDC_MINT, escrowKeypair.publicKey);
      const recipientAta = await getOrCreateAssociatedTokenAccount(
        connection,
        oracle, // oracle pays ATA creation rent
        USDC_MINT,
        recipientPubkey
      );

      const amountSmallest = Math.floor(TEST_AMOUNT * 1_000_000);
      const transferIx = createTransferInstruction(
        escrowAta,
        recipientAta.address,
        escrowKeypair.publicKey,
        amountSmallest,
        [],
        TOKEN_PROGRAM_ID
      );

      const tx = new Transaction().add(transferIx);
      tx.feePayer = oracle.publicKey; // oracle pays gas
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.sign(oracle, escrowKeypair); // both sign

      const signature = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(signature, 'confirmed');

      console.log(`  SUCCESS! Tx: ${signature}`);
      console.log(`  View: https://solscan.io/tx/${signature}?cluster=devnet`);
    } catch (e: any) {
      console.error(`  *** TRANSFER FAILED: ${e.message}`);
      if (e.message.includes('insufficient')) {
        console.error('  *** Escrow has insufficient funds (SOL or USDC)');
      }
    }
  } else {
    console.log('\n=== 7. Test Transfer: SKIPPED (key decryption failed) ===');
  }

  // 8. Summary
  console.log('\n========================================');
  console.log('  SUMMARY');
  console.log('========================================');
  const failedJobs = jobs.filter(j => j.status === 'FAILED');
  const queuedJobs = jobs.filter(j => j.status === 'QUEUED');
  console.log(`  Total jobs: ${jobs.length}`);
  console.log(`  Failed: ${failedJobs.length}`);
  console.log(`  Queued: ${queuedJobs.length}`);
  console.log(`  Completed: ${jobs.filter(j => j.status === 'COMPLETED').length}`);

  if (failedJobs.length > 0) {
    console.log('\n  To retry all failed jobs, run:');
    console.log('    curl -X POST https://api.tryproven.fun/api/admin/payouts/retry-all -H "Authorization: Bearer <token>"');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Script failed:', e);
  await prisma.$disconnect();
});
