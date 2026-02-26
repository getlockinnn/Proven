/**
 * Factory Setup Script
 *
 * This script initializes the Escrow Factory on-chain.
 * Run once after deploying the smart contract.
 *
 * Usage:
 *   npx ts-node src/scripts/setupFactory.ts
 *
 * Required environment variables:
 *   - ORACLE_KEYPAIR_PATH or ORACLE_KEYPAIR_JSON: Path to or JSON of the oracle/authority keypair
 *   - TREASURY_ADDRESS: Solana address to receive forfeited stakes
 *   - SOLANA_RPC_URL: RPC endpoint (defaults to devnet)
 */

import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Load IDL
const idlPath = path.resolve(__dirname, '../idl/proven_stake.json');
const idlJson = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));

const PROGRAM_ID = new PublicKey(idlJson.address);
const RPC_ENDPOINT = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

async function main() {
  console.log('='.repeat(60));
  console.log('PROVEN Factory Setup Script');
  console.log('='.repeat(60));
  console.log();

  // 1. Load authority keypair
  console.log('1. Loading authority keypair...');
  let authorityKeypair: Keypair;

  const keypairJson = process.env.ORACLE_KEYPAIR_JSON;
  const keypairPath = process.env.ORACLE_KEYPAIR_PATH;

  if (keypairJson) {
    try {
      const secretKey = Uint8Array.from(JSON.parse(keypairJson));
      authorityKeypair = Keypair.fromSecretKey(secretKey);
      console.log('   Loaded from ORACLE_KEYPAIR_JSON');
    } catch (e) {
      console.error('   ERROR: Invalid ORACLE_KEYPAIR_JSON format');
      process.exit(1);
    }
  } else if (keypairPath) {
    if (!fs.existsSync(keypairPath)) {
      console.error(`   ERROR: Keypair file not found at ${keypairPath}`);
      process.exit(1);
    }
    try {
      const keyData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
      authorityKeypair = Keypair.fromSecretKey(Uint8Array.from(keyData));
      console.log(`   Loaded from ${keypairPath}`);
    } catch (e) {
      console.error('   ERROR: Invalid keypair file format');
      process.exit(1);
    }
  } else {
    console.error('   ERROR: No keypair configured!');
    console.error('   Set ORACLE_KEYPAIR_PATH or ORACLE_KEYPAIR_JSON in .env');
    process.exit(1);
  }

  console.log(`   Authority: ${authorityKeypair.publicKey.toBase58()}`);
  console.log();

  // 2. Get treasury address
  console.log('2. Configuring treasury...');
  let treasuryPubkey: PublicKey;

  const treasuryAddress = process.env.TREASURY_ADDRESS;
  if (treasuryAddress) {
    try {
      treasuryPubkey = new PublicKey(treasuryAddress);
      console.log(`   Treasury: ${treasuryPubkey.toBase58()}`);
    } catch (e) {
      console.error('   ERROR: Invalid TREASURY_ADDRESS');
      process.exit(1);
    }
  } else {
    // Default to authority as treasury
    treasuryPubkey = authorityKeypair.publicKey;
    console.log(`   Treasury (defaulting to authority): ${treasuryPubkey.toBase58()}`);
  }
  console.log();

  // 3. Oracle will be the same as authority for this setup
  console.log('3. Configuring oracle...');
  const oraclePubkey = authorityKeypair.publicKey;
  console.log(`   Oracle: ${oraclePubkey.toBase58()}`);
  console.log();

  // 4. Connect to Solana
  console.log('4. Connecting to Solana...');
  const connection = new Connection(RPC_ENDPOINT, 'confirmed');
  console.log(`   RPC: ${RPC_ENDPOINT}`);

  // Check balance
  const balance = await connection.getBalance(authorityKeypair.publicKey);
  const balanceInSol = balance / 1e9;
  console.log(`   Authority balance: ${balanceInSol.toFixed(4)} SOL`);

  if (balance < 0.01 * 1e9) {
    console.error('   ERROR: Insufficient balance! Need at least 0.01 SOL');
    console.error('   Run: solana airdrop 2 ' + authorityKeypair.publicKey.toBase58() + ' --url devnet');
    process.exit(1);
  }
  console.log();

  // 5. Set up Anchor program
  console.log('5. Setting up Anchor program...');
  const wallet = new Wallet(authorityKeypair);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
  });
  const program = new Program(idlJson as any, provider);
  console.log(`   Program ID: ${PROGRAM_ID.toBase58()}`);
  console.log();

  // 6. Derive factory PDA
  console.log('6. Deriving factory PDA...');
  const [factoryPDA, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from('factory')],
    PROGRAM_ID
  );
  console.log(`   Factory PDA: ${factoryPDA.toBase58()}`);
  console.log(`   Bump: ${bump}`);
  console.log();

  // 7. Check if factory already exists
  console.log('7. Checking if factory already exists...');
  try {
    const existingFactory = await (program.account as any).escrowFactory.fetch(factoryPDA);
    console.log('   Factory already initialized!');
    console.log();
    console.log('   Current factory settings:');
    console.log(`   - Authority: ${existingFactory.authority.toBase58()}`);
    console.log(`   - Treasury: ${existingFactory.treasury.toBase58()}`);
    console.log(`   - Oracle: ${existingFactory.oracle.toBase58()}`);
    console.log(`   - Challenge count: ${existingFactory.challengeCount.toString()}`);
    console.log();
    console.log('   If you need to update settings, use the update_factory instruction.');
    process.exit(0);
  } catch (e) {
    console.log('   Factory not found. Proceeding with initialization...');
  }
  console.log();

  // 8. Initialize factory
  console.log('8. Initializing factory...');
  console.log('   Sending transaction...');

  try {
    const tx = await program.methods
      .initializeFactory()
      .accountsPartial({
        authority: authorityKeypair.publicKey,
        treasury: treasuryPubkey,
        oracle: oraclePubkey,
        factory: factoryPDA,
        system_program: SystemProgram.programId,
      })
      .signers([authorityKeypair])
      .rpc();

    console.log(`   Transaction: ${tx}`);
    console.log();

    // Wait for confirmation
    console.log('   Waiting for confirmation...');
    await connection.confirmTransaction(tx, 'confirmed');
    console.log('   Confirmed!');
    console.log();

    // 9. Verify factory was created
    console.log('9. Verifying factory...');
    const factory = await (program.account as any).escrowFactory.fetch(factoryPDA);
    console.log('   Factory initialized successfully!');
    console.log();
    console.log('   Factory settings:');
    console.log(`   - Address: ${factoryPDA.toBase58()}`);
    console.log(`   - Authority: ${factory.authority.toBase58()}`);
    console.log(`   - Treasury: ${factory.treasury.toBase58()}`);
    console.log(`   - Oracle: ${factory.oracle.toBase58()}`);
    console.log(`   - Challenge count: ${factory.challengeCount.toString()}`);
    console.log();

    console.log('='.repeat(60));
    console.log('SETUP COMPLETE!');
    console.log('='.repeat(60));
    console.log();
    console.log('Next steps:');
    console.log('1. Make sure your backend .env has:');
    console.log(`   ORACLE_KEYPAIR_PATH=${keypairPath || '[your-keypair-path]'}`);
    console.log(`   TREASURY_ADDRESS=${treasuryPubkey.toBase58()}`);
    console.log();
    console.log('2. Start your backend server:');
    console.log('   npm run dev');
    console.log();
    console.log('3. Create a challenge via the API to test!');
    console.log();

  } catch (error: any) {
    console.error('   ERROR: Failed to initialize factory');
    console.error(`   ${error.message}`);

    if (error.logs) {
      console.error();
      console.error('   Transaction logs:');
      error.logs.forEach((log: string) => console.error(`   ${log}`));
    }

    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
