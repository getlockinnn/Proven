/**
 * Diagnostic script: Test if USDC transfer works on devnet
 *
 * Usage: npx ts-node src/scripts/testPayout.ts
 *
 * This script:
 * 1. Loads the oracle keypair
 * 2. Checks SOL + USDC balances of oracle and recipient
 * 3. Attempts a tiny USDC transfer (0.001 USDC) to the recipient
 * 4. Reports success/failure at each step
 */

import { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import fs from 'fs';
import path from 'path';

const RPC_URL = 'https://api.devnet.solana.com';
const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const RECIPIENT = 'J8yCaC1vajmfB3hnyTfWudnVs5iRePW8KZZSEU1pXzQs';

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');

  // 1. Load oracle keypair
  console.log('\n=== Step 1: Load oracle keypair ===');
  const keypairPath = path.resolve(__dirname, '../../oracle-keypair.json');
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const oracle = Keypair.fromSecretKey(new Uint8Array(secretKey));
  console.log(`Oracle address: ${oracle.publicKey.toBase58()}`);

  // 2. Check oracle SOL balance
  console.log('\n=== Step 2: Check SOL balances ===');
  const oracleSol = await connection.getBalance(oracle.publicKey);
  console.log(`Oracle SOL: ${oracleSol / LAMPORTS_PER_SOL}`);

  const recipientPubkey = new PublicKey(RECIPIENT);
  const recipientSol = await connection.getBalance(recipientPubkey);
  console.log(`Recipient SOL: ${recipientSol / LAMPORTS_PER_SOL}`);

  if (oracleSol < 0.01 * LAMPORTS_PER_SOL) {
    console.error('\n*** Oracle has insufficient SOL for tx fees. Airdrop some first:');
    console.error(`    solana airdrop 1 ${oracle.publicKey.toBase58()} --url devnet`);
    return;
  }

  // 3. Check USDC balances
  console.log('\n=== Step 3: Check USDC balances ===');

  const oracleAta = await getAssociatedTokenAddress(USDC_MINT, oracle.publicKey);
  console.log(`Oracle USDC ATA: ${oracleAta.toBase58()}`);

  try {
    const oracleUsdcBalance = await connection.getTokenAccountBalance(oracleAta);
    console.log(`Oracle USDC: ${oracleUsdcBalance.value.uiAmountString}`);

    if (parseFloat(oracleUsdcBalance.value.uiAmountString || '0') < 0.001) {
      console.error('\n*** Oracle has no USDC to send.');
      console.log('    This means the oracle is not the escrow wallet.');
      console.log('    The escrow wallet is per-challenge and stored encrypted in DB.');
      console.log('    To test, we need to check the actual escrow wallet balance.');
      console.log('\n    Checking if we can find the challenge escrow...');
      await checkEscrowFromEnv(connection);
      return;
    }
  } catch (e) {
    console.log('Oracle has no USDC token account (never held USDC)');
    console.log('\n    The oracle keypair is NOT the escrow wallet.');
    console.log('    Escrow wallets are per-challenge, stored encrypted in DB.');
    await checkEscrowFromEnv(connection);
    return;
  }

  // 4. Try transfer
  console.log('\n=== Step 4: Attempt test USDC transfer (0.001 USDC) ===');
  try {
    const recipientAta = await getOrCreateAssociatedTokenAccount(
      connection,
      oracle,
      USDC_MINT,
      recipientPubkey
    );
    console.log(`Recipient USDC ATA: ${recipientAta.address.toBase58()}`);

    const amount = 1000; // 0.001 USDC (6 decimals)
    const transferIx = createTransferInstruction(
      oracleAta,
      recipientAta.address,
      oracle.publicKey,
      amount,
      [],
      TOKEN_PROGRAM_ID
    );

    const tx = new Transaction().add(transferIx);
    tx.feePayer = oracle.publicKey;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.sign(oracle);

    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature, 'confirmed');

    console.log(`\nSUCCESS! Tx: ${signature}`);
    console.log(`View: https://solscan.io/tx/${signature}?cluster=devnet`);
  } catch (e: any) {
    console.error(`\nFAILED: ${e.message}`);
  }
}

/**
 * Try to find a challenge's escrow address from the DB config
 * and check its balance
 */
async function checkEscrowFromEnv(connection: Connection) {
  console.log('\n=== Checking escrow setup (no DB access) ===');
  console.log('USDC Mint:', USDC_MINT.toBase58());
  console.log('Network: devnet');
  console.log('Recipient:', RECIPIENT);

  // Check if recipient has a USDC token account
  try {
    const recipientPubkey = new PublicKey(RECIPIENT);
    const recipientAta = await getAssociatedTokenAddress(USDC_MINT, recipientPubkey);
    console.log(`\nRecipient expected USDC ATA: ${recipientAta.toBase58()}`);

    try {
      const balance = await connection.getTokenAccountBalance(recipientAta);
      console.log(`Recipient USDC balance: ${balance.value.uiAmountString}`);
    } catch {
      console.log('Recipient has NO USDC token account yet (will be created on first transfer)');
    }
  } catch (e: any) {
    console.error(`Error checking recipient: ${e.message}`);
  }

  console.log('\n=== Diagnosis ===');
  console.log('To test the actual escrow payout, you need to run this ON the production server');
  console.log('where DATABASE_URL and ESCROW_ENCRYPTION_KEY are set correctly.');
  console.log('');
  console.log('Possible failure reasons for payout jobs:');
  console.log('1. Escrow wallet has no SOL for tx fees');
  console.log('2. Escrow wallet has insufficient USDC balance');
  console.log('3. ESCROW_ENCRYPTION_KEY mismatch (can\'t decrypt escrow private key)');
  console.log('4. USDC_MINT mismatch between what was staked and what we\'re transferring');
  console.log('5. RPC rate limits on devnet');
  console.log('');
  console.log('Quick check commands for the production server:');
  console.log('  # Check escrow SOL balance:');
  console.log('  solana balance <ESCROW_ADDRESS> --url devnet');
  console.log('  # Check escrow USDC balance:');
  console.log('  spl-token balance --owner <ESCROW_ADDRESS> 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU --url devnet');
}

main().catch(console.error);
