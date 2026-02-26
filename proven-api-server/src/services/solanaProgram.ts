import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN, Idl } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import * as fs from 'fs';

// Load IDL
const idlJson = require('../idl/proven_stake.json');

// Program ID from env (preferred for deploys) or from the IDL (default).
const PROGRAM_ID = new PublicKey((process.env.PROGRAM_ID as string) || (idlJson.address as string));

const USDC_MINT = new PublicKey(process.env.USDC_MINT!);

const RPC_ENDPOINT = process.env.SOLANA_RPC_URL!;

/**
 * Challenge status enum matching on-chain
 */
export enum ChallengeStatus {
  Created = 'created',
  Started = 'started',
  Ended = 'ended',
  Settled = 'settled',
  Cancelled = 'cancelled',
}

/**
 * On-chain Challenge account data
 */
export interface ChallengeAccount {
  challengeId: string;
  factory: PublicKey;
  creator: PublicKey;
  tokenMint: PublicKey;
  escrowVault: PublicKey;
  stakeAmount: BN;
  totalDays: number;
  thresholdBps: number;
  status: ChallengeStatus;
  startTs: BN;
  endTs: BN;
  participantCount: number;
  activeParticipants: number;
  winnerCount: number;
  loserCount: number;
  bonusPerWinner: BN;
  forfeitedAmount: BN;
  remainder: BN;
  payoutsClaimedCount: number;
  remainderClaimed: BN;
  bump: number;
}

/**
 * On-chain Participant account data
 */
export interface ParticipantAccount {
  user: PublicKey;
  challenge: PublicKey;
  joined: boolean;
  stakeDeposited: BN;
  proofDays: number;
  isWinner: boolean;
  isSettled: boolean;
  payoutClaimed: boolean;
  refundClaimed: boolean;
  bump: number;
}

/**
 * On-chain Factory account data
 */
export interface FactoryAccount {
  authority: PublicKey;
  treasury: PublicKey;
  oracle: PublicKey;
  challengeCount: BN;
  bump: number;
}

/**
 * Solana Program Service
 * Handles all on-chain interactions with the PROVEN smart contract
 */
class SolanaProgramService {
  private connection: Connection;
  private program: Program | null = null;
  private oracleKeypair: Keypair | null = null;

  constructor() {
    this.connection = new Connection(RPC_ENDPOINT, 'confirmed');
  }

  /**
   * Initialize the program with oracle keypair
   */
  async initialize(): Promise<void> {
    // Load oracle keypair from environment or file
    const oracleKeyPath = process.env.ORACLE_KEYPAIR_PATH;
    const oracleKeyJson = process.env.ORACLE_KEYPAIR_JSON;


    if (oracleKeyJson) {
      // Parse from JSON string in env
      const secretKey = Uint8Array.from(JSON.parse(oracleKeyJson));
      this.oracleKeypair = Keypair.fromSecretKey(secretKey);
    } else if (oracleKeyPath && fs.existsSync(oracleKeyPath)) {
      // Load from file
      const keyData = JSON.parse(fs.readFileSync(oracleKeyPath, 'utf-8'));
      this.oracleKeypair = Keypair.fromSecretKey(Uint8Array.from(keyData));
    } else {
      // Use a simple console log here since logger may not be available at this point
      // This is logged properly when initialize() is called from index.ts
    }

    // Create provider and program
    if (this.oracleKeypair) {
      const wallet = new Wallet(this.oracleKeypair);
      const provider = new AnchorProvider(this.connection, wallet, {
        commitment: 'confirmed',
      });
      this.program = new Program(idlJson as any, provider);
    }
  }

  /**
   * Get the program instance
   */
  getProgram(): Program {
    if (!this.program) {
      throw new Error('Program not initialized. Call initialize() first.');
    }
    return this.program;
  }

  /**
   * Get the connection instance
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get the oracle public key
   */
  getOraclePublicKey(): PublicKey | null {
    return this.oracleKeypair?.publicKey || null;
  }

  // ============================================================
  // PDA DERIVATION
  // ============================================================

  /**
   * Derive the factory PDA
   */
  getFactoryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from('factory')], PROGRAM_ID);
  }

  /**
   * Derive the challenge PDA
   */
  getChallengePDA(challengeId: string, factoryPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('challenge'), Buffer.from(challengeId), factoryPubkey.toBuffer()],
      PROGRAM_ID
    );
  }

  /**
   * Derive the participant PDA
   */
  getParticipantPDA(challengePubkey: PublicKey, userPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('participant'), challengePubkey.toBuffer(), userPubkey.toBuffer()],
      PROGRAM_ID
    );
  }

  // ============================================================
  // FACTORY OPERATIONS
  // ============================================================

  /**
   * Initialize the factory (one-time setup)
   */
  async initializeFactory(
    authorityKeypair: Keypair,
    treasuryPubkey: PublicKey,
    oraclePubkey: PublicKey
  ): Promise<string> {
    const program = this.getProgram();
    const [factoryPDA] = this.getFactoryPDA();

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

    return tx;
  }

  /**
   * Fetch factory account data
   */
  async getFactory(): Promise<FactoryAccount | null> {
    try {
      const program = this.getProgram();
      const [factoryPDA] = this.getFactoryPDA();
      const account = await (program.account as any).escrowFactory.fetch(factoryPDA);
      return account as FactoryAccount;
    } catch (error) {
      return null;
    }
  }

  // ============================================================
  // CHALLENGE OPERATIONS
  // ============================================================

  /**
   * Create a new challenge on-chain
   */
  async createChallenge(
    creatorKeypair: Keypair,
    challengeId: string,
    stakeAmount: number,
    totalDays: number,
    startTs: number
  ): Promise<{ signature: string; challengePDA: PublicKey; escrowVault: PublicKey }> {
    const program = this.getProgram();
    const [factoryPDA] = this.getFactoryPDA();
    const [challengePDA] = this.getChallengePDA(challengeId, factoryPDA);

    // Get escrow vault ATA
    const escrowVault = await getAssociatedTokenAddress(USDC_MINT, challengePDA, true);

    // Convert stake amount to smallest unit (6 decimals for USDC)
    const stakeAmountBN = new BN(Math.floor(stakeAmount * 1_000_000));

    const tx = await program.methods
      .createChallenge(challengeId, stakeAmountBN, totalDays, new BN(startTs))
      .accountsPartial({
        creator: creatorKeypair.publicKey,
        factory: factoryPDA,
        challenge: challengePDA,
        tokenMint: USDC_MINT,
        escrowVault: escrowVault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([creatorKeypair])
      .rpc();

    return {
      signature: tx,
      challengePDA,
      escrowVault,
    };
  }

  /**
   * Fetch challenge account data
   */
  async getChallenge(challengeId: string): Promise<ChallengeAccount | null> {
    try {
      const program = this.getProgram();
      const [factoryPDA] = this.getFactoryPDA();
      const [challengePDA] = this.getChallengePDA(challengeId, factoryPDA);
      const account = await (program.account as any).challengeEscrow.fetch(challengePDA);
      return account as ChallengeAccount;
    } catch (error) {
      return null;
    }
  }

  /**
   * Cancel a challenge (before it starts)
   */
  async cancelChallenge(creatorKeypair: Keypair, challengeId: string): Promise<string> {
    const program = this.getProgram();
    const [factoryPDA] = this.getFactoryPDA();
    const [challengePDA] = this.getChallengePDA(challengeId, factoryPDA);

    const tx = await program.methods
      .cancelChallenge(challengeId)
      .accountsPartial({
        creator: creatorKeypair.publicKey,
        factory: factoryPDA,
        challenge: challengePDA,
      })
      .signers([creatorKeypair])
      .rpc();

    return tx;
  }

  // ============================================================
  // PARTICIPANT OPERATIONS
  // ============================================================

  /**
   * Fetch participant account data
   */
  async getParticipant(challengeId: string, userPubkey: PublicKey): Promise<ParticipantAccount | null> {
    try {
      const program = this.getProgram();
      const [factoryPDA] = this.getFactoryPDA();
      const [challengePDA] = this.getChallengePDA(challengeId, factoryPDA);
      const [participantPDA] = this.getParticipantPDA(challengePDA, userPubkey);
      const account = await (program.account as any).participant.fetch(participantPDA);
      return account as ParticipantAccount;
    } catch (error) {
      return null;
    }
  }

  // ============================================================
  // ORACLE OPERATIONS (Require oracle keypair)
  // ============================================================

  /**
   * Record a proof for a participant (oracle only)
   */
  async recordProof(challengeId: string, userPubkey: PublicKey): Promise<string> {
    if (!this.oracleKeypair) {
      throw new Error('Oracle keypair not configured');
    }

    const program = this.getProgram();
    const [factoryPDA] = this.getFactoryPDA();
    const [challengePDA] = this.getChallengePDA(challengeId, factoryPDA);
    const [participantPDA] = this.getParticipantPDA(challengePDA, userPubkey);

    const tx = await program.methods
      .recordProof(challengeId)
      .accountsPartial({
        oracle: this.oracleKeypair.publicKey,
        factory: factoryPDA,
        challenge: challengePDA,
        participant: participantPDA,
      })
      .signers([this.oracleKeypair])
      .rpc();

    return tx;
  }

  /**
   * Settle challenge (mark as ended) - oracle only
   */
  async settleChallenge(challengeId: string): Promise<string> {
    if (!this.oracleKeypair) {
      throw new Error('Oracle keypair not configured');
    }

    const program = this.getProgram();
    const [factoryPDA] = this.getFactoryPDA();
    const [challengePDA] = this.getChallengePDA(challengeId, factoryPDA);

    const tx = await program.methods
      .settleChallenge(challengeId)
      .accountsPartial({
        oracle: this.oracleKeypair.publicKey,
        factory: factoryPDA,
        challenge: challengePDA,
      })
      .signers([this.oracleKeypair])
      .rpc();

    return tx;
  }

  /**
   * Settle a participant (determine winner/loser) - oracle only
   */
  async settleParticipant(challengeId: string, userPubkey: PublicKey): Promise<string> {
    if (!this.oracleKeypair) {
      throw new Error('Oracle keypair not configured');
    }

    const program = this.getProgram();
    const [factoryPDA] = this.getFactoryPDA();
    const [challengePDA] = this.getChallengePDA(challengeId, factoryPDA);
    const [participantPDA] = this.getParticipantPDA(challengePDA, userPubkey);

    const tx = await program.methods
      .settleParticipant(challengeId)
      .accountsPartial({
        oracle: this.oracleKeypair.publicKey,
        factory: factoryPDA,
        challenge: challengePDA,
        participant: participantPDA,
      })
      .signers([this.oracleKeypair])
      .rpc();

    return tx;
  }

  /**
   * Finalize settlement (calculate payouts) - oracle only
   */
  async finalizeSettlement(challengeId: string): Promise<string> {
    if (!this.oracleKeypair) {
      throw new Error('Oracle keypair not configured');
    }

    const program = this.getProgram();
    const [factoryPDA] = this.getFactoryPDA();
    const [challengePDA] = this.getChallengePDA(challengeId, factoryPDA);

    const tx = await program.methods
      .finalizeSettlement(challengeId)
      .accountsPartial({
        oracle: this.oracleKeypair.publicKey,
        factory: factoryPDA,
        challenge: challengePDA,
      })
      .signers([this.oracleKeypair])
      .rpc();

    return tx;
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Get all participants for a challenge
   * Note: This requires iterating through known participants or using getProgramAccounts
   */
  async getAllParticipants(challengeId: string): Promise<ParticipantAccount[]> {
    const program = this.getProgram();
    const [factoryPDA] = this.getFactoryPDA();
    const [challengePDA] = this.getChallengePDA(challengeId, factoryPDA);

    // Fetch all participant accounts for this challenge
    const accounts = await (program.account as any).participant.all([
      {
        memcmp: {
          offset: 8 + 32, // After discriminator + user pubkey
          bytes: challengePDA.toBase58(),
        },
      },
    ]);

    return accounts.map((a: any) => a.account as ParticipantAccount);
  }

  /**
   * Convert USDC amount from on-chain (with 6 decimals) to display amount
   */
  fromUsdcAmount(amount: BN): number {
    return amount.toNumber() / 1_000_000;
  }

  /**
   * Convert display amount to USDC on-chain amount (with 6 decimals)
   */
  toUsdcAmount(amount: number): BN {
    return new BN(Math.floor(amount * 1_000_000));
  }

  /**
   * Check if factory is initialized
   */
  async isFactoryInitialized(): Promise<boolean> {
    const factory = await this.getFactory();
    return factory !== null;
  }
}

// Export singleton instance
export const solanaProgram = new SolanaProgramService();
export { SolanaProgramService, PROGRAM_ID, USDC_MINT };
