import { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import crypto from 'crypto';
import fs from 'fs';
import prisma from '../lib/prisma';

/**
 * Escrow Wallet Service
 * Manages escrow wallets for challenge stakes (Simplified Solana approach)
 */

const RPC_ENDPOINT = process.env.SOLANA_RPC_URL!;
const USDC_MINT = new PublicKey(process.env.USDC_MINT!);

/**
 * Load the oracle keypair — used as fee payer for escrow transactions.
 * Escrow wallets only hold USDC (no SOL for tx fees), so the oracle pays gas.
 */
function loadFeePayerKeypair(): Keypair {
  // Try JSON env var first, then file path
  const json = process.env.ORACLE_KEYPAIR_JSON;
  if (json) {
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(json)));
  }
  const filePath = process.env.ORACLE_KEYPAIR_PATH || './oracle-keypair.json';
  const data = fs.readFileSync(filePath, 'utf-8');
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(data)));
}

// Encryption key for storing private keys (MUST be set in environment!)
// Generate with: openssl rand -base64 32
// Note: Validated at runtime when needed, not at import time (for graceful startup)
function getEncryptionKey(): string {
  const key = process.env.ESCROW_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'ESCROW_ENCRYPTION_KEY environment variable is required! ' +
      'Generate a secure key with: openssl rand -base64 32'
    );
  }
  return key;
}

class EscrowService {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(RPC_ENDPOINT, 'confirmed');
  }

  /**
   * Generate a new escrow wallet for a challenge
   */
  async createEscrowWallet(challengeId: string): Promise<{
    publicKey: string;
    balance: number;
  }> {
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toString();
    const encryptedSecret = this.encryptSecretKey(keypair.secretKey);

    await prisma.$transaction(async (tx) => {
      await tx.escrowWallet.upsert({
        where: { challengeId },
        create: {
          challengeId,
          publicKey,
          secretKey: encryptedSecret,
        },
        update: {
          publicKey,
          secretKey: encryptedSecret,
        },
      });

      await tx.challenge.update({
        where: { id: challengeId },
        data: {
          escrowAddress: publicKey,
        },
      });
    });

    const balance = await this.connection.getBalance(keypair.publicKey);
    const balanceInSol = balance / LAMPORTS_PER_SOL;

    return {
      publicKey,
      balance: balanceInSol,
    };
  }

  /**
   * Store encrypted private key for escrow wallet
   */
  private encryptSecretKey(secretKey: Uint8Array): string {
    const key = crypto.createHash('sha256').update(getEncryptionKey()).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(secretKey)),
      cipher.final(),
    ]);

    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Load escrow wallet keypair for a challenge
   */
  private async loadKeypair(challengeId: string): Promise<Keypair> {
    const record = await prisma.escrowWallet.findUnique({
      where: { challengeId },
    });

    if (!record) {
      throw new Error(`Escrow key not found for challenge: ${challengeId}`);
    }

    const secretKeyBytes = this.decryptSecretKey(record.secretKey);
    return Keypair.fromSecretKey(secretKeyBytes);
  }

  private decryptSecretKey(payload: string): Uint8Array {
    const [ivHex, encryptedHex] = payload.split(':');
    if (!ivHex || !encryptedHex) {
      throw new Error('Invalid encrypted key payload');
    }

    const key = crypto.createHash('sha256').update(getEncryptionKey()).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);

    return new Uint8Array(decrypted);
  }

  /**
   * Verify a USDC transfer to escrow wallet
   */
  async verifyTransfer(
    transactionSignature: string,
    senderWallet: string,
    escrowAddress: string,
    expectedAmount: number
  ): Promise<boolean> {
    try {
      // Fetch transaction
      const tx = await this.connection.getTransaction(transactionSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        return false;
      }

      // Check if transaction succeeded
      if (tx.meta?.err) {
        return false;
      }

      // Verify sender signed the transaction
      const senderPubkey = new PublicKey(senderWallet);
      const accountKeys = tx.transaction.message.getAccountKeys().staticAccountKeys;
      const senderSigned = accountKeys.some((key) => key.equals(senderPubkey));

      if (!senderSigned) {
        return false;
      }

      // Get escrow's USDC token account
      const escrowPubkey = new PublicKey(escrowAddress);
      const escrowTokenAccount = await getAssociatedTokenAddress(USDC_MINT, escrowPubkey);

      // Check if escrow token account received USDC
      const escrowAccountIndex = accountKeys.findIndex((key) => key.equals(escrowTokenAccount));

      if (escrowAccountIndex === -1) {
        return false;
      }

      // Verify balance change (USDC has 6 decimals)
      const preBalance = tx.meta?.preTokenBalances?.find(
        (bal) => bal.accountIndex === escrowAccountIndex
      )?.uiTokenAmount?.uiAmount || 0;

      const postBalance = tx.meta?.postTokenBalances?.find(
        (bal) => bal.accountIndex === escrowAccountIndex
      )?.uiTokenAmount?.uiAmount || 0;

      const transferred = postBalance - preBalance;

      // Allow small tolerance (0.01 USDC)
      const tolerance = 0.01;
      if (Math.abs(transferred - expectedAmount) > tolerance) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get escrow wallet USDC balance
   * Throws on RPC error — callers must handle failures explicitly.
   */
  async getEscrowBalance(escrowAddress: string): Promise<number> {
    try {
      const escrowPubkey = new PublicKey(escrowAddress);
      const tokenAccount = await getAssociatedTokenAddress(USDC_MINT, escrowPubkey);

      const balance = await this.connection.getTokenAccountBalance(tokenAccount);
      return parseFloat(balance.value.uiAmountString || '0');
    } catch (error) {
      throw new Error(
        `Failed to fetch escrow balance for ${escrowAddress}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Send payout from escrow wallet
   */
  async sendPayout(
    challengeId: string,
    recipientWallet: string,
    amount: number
  ): Promise<string> {
    try {
      // Load escrow keypair (signs the USDC transfer)
      const escrowKeypair = await this.loadKeypair(challengeId);

      // Load oracle keypair as fee payer (escrow has no SOL for gas)
      const feePayer = loadFeePayerKeypair();

      // Get token accounts
      const escrowTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        escrowKeypair.publicKey
      );

      const recipientPubkey = new PublicKey(recipientWallet);
      // Use getOrCreateAssociatedTokenAccount to ensure the recipient ATA exists
      // (prevents failures when recipient has never held USDC)
      // Oracle pays the ATA creation rent if needed
      const recipientAta = await getOrCreateAssociatedTokenAccount(
        this.connection,
        feePayer, // oracle pays for ATA creation
        USDC_MINT,
        recipientPubkey
      );
      const recipientTokenAccount = recipientAta.address;

      // Convert amount to smallest unit (6 decimals for USDC)
      const amountInSmallestUnit = Math.floor(amount * 1_000_000);

      // Create transfer instruction
      const transferInstruction = createTransferInstruction(
        escrowTokenAccount,
        recipientTokenAccount,
        escrowKeypair.publicKey,
        amountInSmallestUnit,
        [],
        TOKEN_PROGRAM_ID
      );

      // Create and send transaction
      // Oracle pays tx fees, escrow signs the USDC transfer
      const transaction = new Transaction().add(transferInstruction);
      transaction.feePayer = feePayer.publicKey;

      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;

      // Both must sign: oracle (fee payer) + escrow (token authority)
      transaction.sign(feePayer, escrowKeypair);
      const signature = await this.connection.sendRawTransaction(transaction.serialize());

      // Confirm
      await this.connection.confirmTransaction(signature, 'confirmed');

      return signature;
    } catch (error) {
      throw new Error(`Failed to send payout: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get Solana connection
   */
  getConnection(): Connection {
    return this.connection;
  }
}

// Export singleton instance
export const escrowService = new EscrowService();
export { EscrowService };
