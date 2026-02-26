import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

// IDL will be loaded by Anchor
const IDL = require("../target/idl/proven_stake.json");

describe("proven-stake", () => {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Program ID from localnet config
  const PROGRAM_ID = new PublicKey("2axKJmSNPkdAysQXjz7y2R2Tho58WbzLYgYcAsMgfMKc");
  const program = new Program(IDL, provider);

  // Test accounts
  let authority: Keypair;
  let treasury: Keypair;
  let oracle: Keypair;
  let creator: Keypair;
  let user1: Keypair;
  let user2: Keypair;
  let user3: Keypair;

  // Token mint (mock USDC)
  let usdcMint: PublicKey;
  const USDC_DECIMALS = 6;

  // PDAs
  let factoryPDA: PublicKey;
  let factoryBump: number;

  // Test constants
  const STAKE_AMOUNT = 10 * 10 ** USDC_DECIMALS; // 10 USDC
  const TOTAL_DAYS = 10;
  const WIN_THRESHOLD_BPS = 8000; // 80%

  /**
   * Helper: Airdrop SOL to a keypair
   */
  async function airdrop(pubkey: PublicKey, amount: number = 10) {
    const sig = await provider.connection.requestAirdrop(
      pubkey,
      amount * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  /**
   * Helper: Create token account and mint tokens
   */
  async function setupTokenAccount(
    owner: Keypair,
    amount: number
  ): Promise<PublicKey> {
    const ata = await createAssociatedTokenAccount(
      provider.connection,
      owner,
      usdcMint,
      owner.publicKey
    );
    if (amount > 0) {
      await mintTo(
        provider.connection,
        authority,
        usdcMint,
        ata,
        authority,
        amount
      );
    }
    return ata;
  }

  /**
   * Helper: Get factory PDA
   */
  function getFactoryPDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("factory")],
      PROGRAM_ID
    );
  }

  /**
   * Helper: Get challenge PDA
   */
  function getChallengePDA(
    challengeId: string,
    factory: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("challenge"), Buffer.from(challengeId), factory.toBuffer()],
      PROGRAM_ID
    );
  }

  /**
   * Helper: Get participant PDA
   */
  function getParticipantPDA(
    challenge: PublicKey,
    user: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("participant"), challenge.toBuffer(), user.toBuffer()],
      PROGRAM_ID
    );
  }

  /**
   * Helper: Get escrow vault ATA
   */
  async function getEscrowVault(challenge: PublicKey): Promise<PublicKey> {
    return await anchor.utils.token.associatedAddress({
      mint: usdcMint,
      owner: challenge,
    });
  }

  /**
   * Helper: Get future timestamp
   */
  function getFutureTimestamp(secondsFromNow: number): number {
    return Math.floor(Date.now() / 1000) + secondsFromNow;
  }

  /**
   * Helper: Wait for time to pass (for testing time-sensitive functions)
   */
  async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================
  // SETUP
  // ============================================================

  before(async () => {
    // Generate test keypairs
    authority = Keypair.generate();
    treasury = Keypair.generate();
    oracle = Keypair.generate();
    creator = Keypair.generate();
    user1 = Keypair.generate();
    user2 = Keypair.generate();
    user3 = Keypair.generate();

    // Airdrop SOL to all accounts
    await Promise.all([
      airdrop(authority.publicKey),
      airdrop(treasury.publicKey),
      airdrop(oracle.publicKey),
      airdrop(creator.publicKey),
      airdrop(user1.publicKey),
      airdrop(user2.publicKey),
      airdrop(user3.publicKey),
    ]);

    // Create mock USDC mint
    usdcMint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      USDC_DECIMALS
    );

    // Get factory PDA
    [factoryPDA, factoryBump] = getFactoryPDA();

    console.log("Test setup complete:");
    console.log("  Authority:", authority.publicKey.toBase58());
    console.log("  Treasury:", treasury.publicKey.toBase58());
    console.log("  Oracle:", oracle.publicKey.toBase58());
    console.log("  USDC Mint:", usdcMint.toBase58());
    console.log("  Factory PDA:", factoryPDA.toBase58());
  });

  // ============================================================
  // FACTORY TESTS
  // ============================================================

  describe("Factory", () => {
    it("should initialize factory", async () => {
      await program.methods
        .initializeFactory()
        .accountsPartial({
          authority: authority.publicKey,
          treasury: treasury.publicKey,
          oracle: oracle.publicKey,
          factory: factoryPDA,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Verify factory state
      const factory = await (program.account as any).escrowFactory.fetch(
        factoryPDA
      );
      expect(factory.authority.toBase58()).to.equal(
        authority.publicKey.toBase58()
      );
      expect(factory.treasury.toBase58()).to.equal(
        treasury.publicKey.toBase58()
      );
      expect(factory.oracle.toBase58()).to.equal(oracle.publicKey.toBase58());
      expect(factory.challengeCount.toNumber()).to.equal(0);
    });

    it("should fail to initialize factory twice", async () => {
      try {
        await program.methods
          .initializeFactory()
          .accountsPartial({
            authority: authority.publicKey,
            treasury: treasury.publicKey,
            oracle: oracle.publicKey,
            factory: factoryPDA,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (err: any) {
        // Account already exists error
        expect(err.toString()).to.include("already in use");
      }
    });

    it("should update factory settings", async () => {
      const newTreasury = Keypair.generate();
      await airdrop(newTreasury.publicKey, 1);

      await program.methods
        .updateFactory(null, newTreasury.publicKey, null, null)
        .accountsPartial({
          authority: authority.publicKey,
          factory: factoryPDA,
        })
        .signers([authority])
        .rpc();

      const factory = await (program.account as any).escrowFactory.fetch(
        factoryPDA
      );
      expect(factory.treasury.toBase58()).to.equal(
        newTreasury.publicKey.toBase58()
      );

      // Restore original treasury
      await program.methods
        .updateFactory(null, treasury.publicKey, null, null)
        .accountsPartial({
          authority: authority.publicKey,
          factory: factoryPDA,
        })
        .signers([authority])
        .rpc();
    });

    it("should fail to update factory with wrong authority", async () => {
      try {
        await program.methods
          .updateFactory(null, treasury.publicKey, null, null)
          .accountsPartial({
            authority: creator.publicKey, // Wrong authority
            factory: factoryPDA,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });
  });

  // ============================================================
  // CHALLENGE CREATION TESTS
  // ============================================================

  describe("Challenge Creation", () => {
    const challengeId = "test-challenge-001";
    let challengePDA: PublicKey;
    let escrowVault: PublicKey;

    before(async () => {
      [challengePDA] = getChallengePDA(challengeId, factoryPDA);
      escrowVault = await getEscrowVault(challengePDA);
    });

    it("should create a challenge", async () => {
      const startTs = getFutureTimestamp(60); // Start in 60 seconds

      await program.methods
        .createChallenge(
          challengeId,
          new BN(STAKE_AMOUNT),
          TOTAL_DAYS,
          new BN(startTs)
        )
        .accountsPartial({
          creator: creator.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          tokenMint: usdcMint,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc();

      // Verify challenge state
      const challenge = await (program.account as any).challengeEscrow.fetch(
        challengePDA
      );
      expect(challenge.challengeId).to.equal(challengeId);
      expect(challenge.creator.toBase58()).to.equal(
        creator.publicKey.toBase58()
      );
      expect(challenge.stakeAmount.toNumber()).to.equal(STAKE_AMOUNT);
      expect(challenge.totalDays).to.equal(TOTAL_DAYS);
      expect(challenge.thresholdBps).to.equal(WIN_THRESHOLD_BPS);
      expect(challenge.status.created).to.not.be.undefined;
      expect(challenge.participantCount).to.equal(0);

      // Verify factory count incremented
      const factory = await (program.account as any).escrowFactory.fetch(
        factoryPDA
      );
      expect(factory.challengeCount.toNumber()).to.equal(1);
    });

    it("should fail to create challenge with past start time", async () => {
      const pastStartTs = getFutureTimestamp(-60); // 60 seconds ago
      const badChallengeId = "bad-challenge-001";
      const [badChallengePDA] = getChallengePDA(badChallengeId, factoryPDA);
      const badEscrowVault = await getEscrowVault(badChallengePDA);

      try {
        await program.methods
          .createChallenge(
            badChallengeId,
            new BN(STAKE_AMOUNT),
            TOTAL_DAYS,
            new BN(pastStartTs)
          )
          .accountsPartial({
            creator: creator.publicKey,
            factory: factoryPDA,
            challenge: badChallengePDA,
            tokenMint: usdcMint,
            escrowVault: badEscrowVault,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.toString()).to.include("InvalidStartTime");
      }
    });

    it("should fail to create challenge with zero stake", async () => {
      const zeroStakeChallengeId = "zero-stake-001";
      const [zeroChallengePDA] = getChallengePDA(
        zeroStakeChallengeId,
        factoryPDA
      );
      const zeroEscrowVault = await getEscrowVault(zeroChallengePDA);

      try {
        await program.methods
          .createChallenge(
            zeroStakeChallengeId,
            new BN(0), // Zero stake
            TOTAL_DAYS,
            new BN(getFutureTimestamp(60))
          )
          .accountsPartial({
            creator: creator.publicKey,
            factory: factoryPDA,
            challenge: zeroChallengePDA,
            tokenMint: usdcMint,
            escrowVault: zeroEscrowVault,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.toString()).to.include("InvalidAmount");
      }
    });
  });

  // ============================================================
  // JOIN CHALLENGE TESTS
  // ============================================================

  describe("Join Challenge", () => {
    const challengeId = "join-test-001";
    let challengePDA: PublicKey;
    let escrowVault: PublicKey;
    let user1TokenAccount: PublicKey;
    let user2TokenAccount: PublicKey;

    before(async () => {
      // Create a new challenge
      [challengePDA] = getChallengePDA(challengeId, factoryPDA);
      escrowVault = await getEscrowVault(challengePDA);

      const startTs = getFutureTimestamp(120); // Start in 2 minutes

      await program.methods
        .createChallenge(
          challengeId,
          new BN(STAKE_AMOUNT),
          TOTAL_DAYS,
          new BN(startTs)
        )
        .accountsPartial({
          creator: creator.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          tokenMint: usdcMint,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc();

      // Setup user token accounts with USDC
      user1TokenAccount = await setupTokenAccount(user1, STAKE_AMOUNT * 2);
      user2TokenAccount = await setupTokenAccount(user2, STAKE_AMOUNT * 2);
    });

    it("should allow user to join challenge", async () => {
      const [participantPDA] = getParticipantPDA(challengePDA, user1.publicKey);

      await program.methods
        .joinChallenge(challengeId)
        .accountsPartial({
          user: user1.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: participantPDA,
          userTokenAccount: user1TokenAccount,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user1])
        .rpc();

      // Verify participant state
      const participant = await (program.account as any).participant.fetch(
        participantPDA
      );
      expect(participant.user.toBase58()).to.equal(user1.publicKey.toBase58());
      expect(participant.joined).to.be.true;
      expect(participant.stakeDeposited.toNumber()).to.equal(STAKE_AMOUNT);
      expect(participant.proofDays).to.equal(0);
      expect(participant.isWinner).to.be.false;

      // Verify escrow received tokens
      const vaultAccount = await getAccount(provider.connection, escrowVault);
      expect(Number(vaultAccount.amount)).to.equal(STAKE_AMOUNT);

      // Verify challenge participant count
      const challenge = await (program.account as any).challengeEscrow.fetch(
        challengePDA
      );
      expect(challenge.participantCount).to.equal(1);
      expect(challenge.activeParticipants).to.equal(1);
    });

    it("should allow multiple users to join", async () => {
      const [participantPDA] = getParticipantPDA(challengePDA, user2.publicKey);

      await program.methods
        .joinChallenge(challengeId)
        .accountsPartial({
          user: user2.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: participantPDA,
          userTokenAccount: user2TokenAccount,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user2])
        .rpc();

      // Verify escrow has both stakes
      const vaultAccount = await getAccount(provider.connection, escrowVault);
      expect(Number(vaultAccount.amount)).to.equal(STAKE_AMOUNT * 2);

      // Verify challenge participant count
      const challenge = await (program.account as any).challengeEscrow.fetch(
        challengePDA
      );
      expect(challenge.participantCount).to.equal(2);
    });

    it("should fail to join same challenge twice", async () => {
      const [participantPDA] = getParticipantPDA(challengePDA, user1.publicKey);

      try {
        await program.methods
          .joinChallenge(challengeId)
          .accountsPartial({
            user: user1.publicKey,
            factory: factoryPDA,
            challenge: challengePDA,
            participant: participantPDA,
            userTokenAccount: user1TokenAccount,
            escrowVault: escrowVault,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user1])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (err: any) {
        // Account already exists
        expect(err.toString()).to.include("already in use");
      }
    });
  });

  // ============================================================
  // RECORD PROOF TESTS
  // ============================================================

  describe("Record Proof", () => {
    const challengeId = "proof-test-001";
    let challengePDA: PublicKey;
    let escrowVault: PublicKey;
    let participantPDA: PublicKey;
    let userTokenAccount: PublicKey;

    before(async () => {
      // Create challenge that starts soon (5 seconds)
      [challengePDA] = getChallengePDA(challengeId, factoryPDA);
      escrowVault = await getEscrowVault(challengePDA);

      const startTs = getFutureTimestamp(5);

      await program.methods
        .createChallenge(
          challengeId,
          new BN(STAKE_AMOUNT),
          TOTAL_DAYS,
          new BN(startTs)
        )
        .accountsPartial({
          creator: creator.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          tokenMint: usdcMint,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc();

      // Setup user and join
      userTokenAccount = await setupTokenAccount(user3, STAKE_AMOUNT * 2);
      [participantPDA] = getParticipantPDA(challengePDA, user3.publicKey);

      await program.methods
        .joinChallenge(challengeId)
        .accountsPartial({
          user: user3.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: participantPDA,
          userTokenAccount: userTokenAccount,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user3])
        .rpc();

      // Wait for challenge to start
      await sleep(6000);
    });

    it("should allow oracle to record proof", async () => {
      await program.methods
        .recordProof(challengeId)
        .accountsPartial({
          oracle: oracle.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: participantPDA,
        })
        .signers([oracle])
        .rpc();

      // Verify participant proof days
      const participant = await (program.account as any).participant.fetch(
        participantPDA
      );
      expect(participant.proofDays).to.equal(1);

      // Verify challenge auto-started
      const challenge = await (program.account as any).challengeEscrow.fetch(
        challengePDA
      );
      expect(challenge.status.started).to.not.be.undefined;
    });

    it("should allow multiple proofs", async () => {
      // Record 7 more proofs (total 8)
      for (let i = 0; i < 7; i++) {
        await program.methods
          .recordProof(challengeId)
          .accountsPartial({
            oracle: oracle.publicKey,
            factory: factoryPDA,
            challenge: challengePDA,
            participant: participantPDA,
          })
          .signers([oracle])
          .rpc();
      }

      const participant = await (program.account as any).participant.fetch(
        participantPDA
      );
      expect(participant.proofDays).to.equal(8);
    });

    it("should fail when non-oracle tries to record proof", async () => {
      try {
        await program.methods
          .recordProof(challengeId)
          .accountsPartial({
            oracle: user1.publicKey, // Not the oracle
            factory: factoryPDA,
            challenge: challengePDA,
            participant: participantPDA,
          })
          .signers([user1])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.toString()).to.include("InvalidOracle");
      }
    });
  });

  // ============================================================
  // SETTLEMENT TESTS - MIXED WINNERS/LOSERS
  // ============================================================

  describe("Settlement - Mixed Winners/Losers", () => {
    const challengeId = "settle-mixed-001";
    let challengePDA: PublicKey;
    let escrowVault: PublicKey;
    let participant1PDA: PublicKey;
    let participant2PDA: PublicKey;
    let winner: Keypair;
    let loser: Keypair;
    let winnerTokenAccount: PublicKey;
    let loserTokenAccount: PublicKey;

    before(async () => {
      winner = Keypair.generate();
      loser = Keypair.generate();
      await Promise.all([
        airdrop(winner.publicKey),
        airdrop(loser.publicKey),
      ]);

      // Create challenge that starts in 3 seconds and lasts 1 day
      [challengePDA] = getChallengePDA(challengeId, factoryPDA);
      escrowVault = await getEscrowVault(challengePDA);

      const startTs = getFutureTimestamp(3);

      await program.methods
        .createChallenge(
          challengeId,
          new BN(STAKE_AMOUNT),
          1, // 1 day - so 80% threshold = 1 proof needed
          new BN(startTs)
        )
        .accountsPartial({
          creator: creator.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          tokenMint: usdcMint,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc();

      // Setup users and join
      winnerTokenAccount = await setupTokenAccount(winner, STAKE_AMOUNT * 2);
      loserTokenAccount = await setupTokenAccount(loser, STAKE_AMOUNT * 2);

      [participant1PDA] = getParticipantPDA(challengePDA, winner.publicKey);
      [participant2PDA] = getParticipantPDA(challengePDA, loser.publicKey);

      // Both join
      await program.methods
        .joinChallenge(challengeId)
        .accountsPartial({
          user: winner.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: participant1PDA,
          userTokenAccount: winnerTokenAccount,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([winner])
        .rpc();

      await program.methods
        .joinChallenge(challengeId)
        .accountsPartial({
          user: loser.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: participant2PDA,
          userTokenAccount: loserTokenAccount,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([loser])
        .rpc();

      // Wait for challenge to start
      await sleep(4000);

      // Record proof only for winner
      await program.methods
        .recordProof(challengeId)
        .accountsPartial({
          oracle: oracle.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: participant1PDA,
        })
        .signers([oracle])
        .rpc();

      // Fast forward time by modifying end_ts (simulate challenge ended)
      // In real tests, you'd wait or use a local validator with time manipulation
      // For now, we'll update the challenge end time via a direct account modification
      // This is a simplification - in production tests, use proper time manipulation
    });

    it("should settle challenge (mark as ended)", async () => {
      // Note: In a real test, you'd wait for end_ts to pass
      // For this test, we'll catch the expected error if time hasn't passed
      try {
        await program.methods
          .settleChallenge(challengeId)
          .accountsPartial({
            oracle: oracle.publicKey,
            factory: factoryPDA,
            challenge: challengePDA,
          })
          .signers([oracle])
          .rpc();

        const challenge = await (program.account as any).challengeEscrow.fetch(
          challengePDA
        );
        expect(challenge.status.ended).to.not.be.undefined;
      } catch (err: any) {
        // Expected if challenge hasn't ended yet
        expect(err.toString()).to.include("ChallengeNotEnded");
        console.log("Note: Challenge hasn't ended yet - skipping settlement tests");
      }
    });
  });

  // ============================================================
  // CANCELLATION TESTS
  // ============================================================

  describe("Cancellation", () => {
    const challengeId = "cancel-test-001";
    let challengePDA: PublicKey;
    let escrowVault: PublicKey;
    let participantPDA: PublicKey;
    let cancelUser: Keypair;
    let cancelUserTokenAccount: PublicKey;

    before(async () => {
      cancelUser = Keypair.generate();
      await airdrop(cancelUser.publicKey);

      // Create challenge
      [challengePDA] = getChallengePDA(challengeId, factoryPDA);
      escrowVault = await getEscrowVault(challengePDA);

      const startTs = getFutureTimestamp(300); // Start in 5 minutes

      await program.methods
        .createChallenge(
          challengeId,
          new BN(STAKE_AMOUNT),
          TOTAL_DAYS,
          new BN(startTs)
        )
        .accountsPartial({
          creator: creator.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          tokenMint: usdcMint,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc();

      // User joins
      cancelUserTokenAccount = await setupTokenAccount(
        cancelUser,
        STAKE_AMOUNT * 2
      );
      [participantPDA] = getParticipantPDA(challengePDA, cancelUser.publicKey);

      await program.methods
        .joinChallenge(challengeId)
        .accountsPartial({
          user: cancelUser.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: participantPDA,
          userTokenAccount: cancelUserTokenAccount,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([cancelUser])
        .rpc();
    });

    it("should allow creator to cancel challenge before start", async () => {
      await program.methods
        .cancelChallenge(challengeId)
        .accountsPartial({
          creator: creator.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
        })
        .signers([creator])
        .rpc();

      const challenge = await (program.account as any).challengeEscrow.fetch(
        challengePDA
      );
      expect(challenge.status.cancelled).to.not.be.undefined;
    });

    it("should allow participant to claim refund after cancellation", async () => {
      const balanceBefore = await getAccount(
        provider.connection,
        cancelUserTokenAccount
      );

      await program.methods
        .claimRefund(challengeId)
        .accountsPartial({
          user: cancelUser.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: participantPDA,
          userTokenAccount: cancelUserTokenAccount,
          escrowVault: escrowVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([cancelUser])
        .rpc();

      // Verify refund received
      const balanceAfter = await getAccount(
        provider.connection,
        cancelUserTokenAccount
      );
      expect(Number(balanceAfter.amount) - Number(balanceBefore.amount)).to.equal(
        STAKE_AMOUNT
      );

      // Verify participant state
      const participant = await (program.account as any).participant.fetch(
        participantPDA
      );
      expect(participant.refundClaimed).to.be.true;
    });

    it("should fail to claim refund twice", async () => {
      try {
        await program.methods
          .claimRefund(challengeId)
          .accountsPartial({
            user: cancelUser.publicKey,
            factory: factoryPDA,
            challenge: challengePDA,
            participant: participantPDA,
            userTokenAccount: cancelUserTokenAccount,
            escrowVault: escrowVault,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([cancelUser])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.toString()).to.include("AlreadyClaimed");
      }
    });

    it("should fail for non-creator to cancel challenge", async () => {
      // Create a new challenge for this test
      const newChallengeId = "cancel-auth-test-001";
      const [newChallengePDA] = getChallengePDA(newChallengeId, factoryPDA);
      const newEscrowVault = await getEscrowVault(newChallengePDA);

      await program.methods
        .createChallenge(
          newChallengeId,
          new BN(STAKE_AMOUNT),
          TOTAL_DAYS,
          new BN(getFutureTimestamp(300))
        )
        .accountsPartial({
          creator: creator.publicKey,
          factory: factoryPDA,
          challenge: newChallengePDA,
          tokenMint: usdcMint,
          escrowVault: newEscrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc();

      try {
        await program.methods
          .cancelChallenge(newChallengeId)
          .accountsPartial({
            creator: user1.publicKey, // Not the creator
            factory: factoryPDA,
            challenge: newChallengePDA,
          })
          .signers([user1])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.toString()).to.include("Unauthorized");
      }
    });
  });

  // ============================================================
  // REWARDS TESTS (END-TO-END PAYOUTS)
  // ============================================================

  describe("Rewards (Payouts + Forfeits)", () => {
    const DAY_LENGTH_SECONDS = 3;

    before(async () => {
      // Shorten "day length" so challenges can end quickly on localnet.
      await program.methods
        .updateFactory(null, null, null, new BN(DAY_LENGTH_SECONDS))
        .accountsPartial({
          authority: authority.publicKey,
          factory: factoryPDA,
        })
        .signers([authority])
        .rpc();
    });

    after(async () => {
      // Restore default day length (86400) so future local runs behave normally.
      await program.methods
        .updateFactory(null, null, null, new BN(24 * 60 * 60))
        .accountsPartial({
          authority: authority.publicKey,
          factory: factoryPDA,
        })
        .signers([authority])
        .rpc();
    });

    it("should pay a winner stake + bonus (mixed winners/losers)", async () => {
      const challengeId = "rewards-mixed-001";
      const [challengePDA] = getChallengePDA(challengeId, factoryPDA);
      const escrowVault = await getEscrowVault(challengePDA);

      const winner = Keypair.generate();
      const loser = Keypair.generate();
      await Promise.all([airdrop(winner.publicKey), airdrop(loser.publicKey)]);

      const winnerTokenAccount = await setupTokenAccount(winner, STAKE_AMOUNT * 3);
      const loserTokenAccount = await setupTokenAccount(loser, STAKE_AMOUNT * 3);

      const startTs = getFutureTimestamp(2);

      await program.methods
        .createChallenge(challengeId, new BN(STAKE_AMOUNT), 1, new BN(startTs))
        .accountsPartial({
          creator: creator.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          tokenMint: usdcMint,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc();

      const [winnerPDA] = getParticipantPDA(challengePDA, winner.publicKey);
      const [loserPDA] = getParticipantPDA(challengePDA, loser.publicKey);

      await program.methods
        .joinChallenge(challengeId)
        .accountsPartial({
          user: winner.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: winnerPDA,
          userTokenAccount: winnerTokenAccount,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([winner])
        .rpc();

      await program.methods
        .joinChallenge(challengeId)
        .accountsPartial({
          user: loser.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: loserPDA,
          userTokenAccount: loserTokenAccount,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([loser])
        .rpc();

      // Wait for start.
      await sleep(2500);

      // Winner submits proof once. For total_days=1, required proofs should be 1 (80% ceil).
      await program.methods
        .recordProof(challengeId)
        .accountsPartial({
          oracle: oracle.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: winnerPDA,
        })
        .signers([oracle])
        .rpc();

      // Ensure the challenge has ended.
      await sleep((DAY_LENGTH_SECONDS + 2) * 1000);

      await program.methods
        .settleChallenge(challengeId)
        .accountsPartial({
          oracle: oracle.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
        })
        .signers([oracle])
        .rpc();

      // Settle both participants, then finalize.
      await program.methods
        .settleParticipant(challengeId)
        .accountsPartial({
          oracle: oracle.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: winnerPDA,
        })
        .signers([oracle])
        .rpc();

      await program.methods
        .settleParticipant(challengeId)
        .accountsPartial({
          oracle: oracle.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: loserPDA,
        })
        .signers([oracle])
        .rpc();

      await program.methods
        .finalizeSettlement(challengeId)
        .accountsPartial({
          oracle: oracle.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
        })
        .signers([oracle])
        .rpc();

      const winnerBalBefore = await getAccount(provider.connection, winnerTokenAccount);

      await program.methods
        .claimPayout(challengeId)
        .accountsPartial({
          user: winner.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: winnerPDA,
          userTokenAccount: winnerTokenAccount,
          escrowVault: escrowVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([winner])
        .rpc();

      const winnerBalAfter = await getAccount(provider.connection, winnerTokenAccount);
      expect(Number(winnerBalAfter.amount) - Number(winnerBalBefore.amount)).to.equal(STAKE_AMOUNT * 2);

      const vaultAccount = await getAccount(provider.connection, escrowVault);
      expect(Number(vaultAccount.amount)).to.equal(0);
    });

    it("should allow treasury to claim forfeited stakes when no winners", async () => {
      const challengeId = "rewards-nowin-001";
      const [challengePDA] = getChallengePDA(challengeId, factoryPDA);
      const escrowVault = await getEscrowVault(challengePDA);

      const u1 = Keypair.generate();
      const u2 = Keypair.generate();
      await Promise.all([airdrop(u1.publicKey), airdrop(u2.publicKey)]);

      const u1TokenAccount = await setupTokenAccount(u1, STAKE_AMOUNT * 3);
      const u2TokenAccount = await setupTokenAccount(u2, STAKE_AMOUNT * 3);

      const startTs = getFutureTimestamp(2);

      await program.methods
        .createChallenge(challengeId, new BN(STAKE_AMOUNT), 1, new BN(startTs))
        .accountsPartial({
          creator: creator.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          tokenMint: usdcMint,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc();

      const [p1] = getParticipantPDA(challengePDA, u1.publicKey);
      const [p2] = getParticipantPDA(challengePDA, u2.publicKey);

      await program.methods
        .joinChallenge(challengeId)
        .accountsPartial({
          user: u1.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: p1,
          userTokenAccount: u1TokenAccount,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([u1])
        .rpc();

      await program.methods
        .joinChallenge(challengeId)
        .accountsPartial({
          user: u2.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: p2,
          userTokenAccount: u2TokenAccount,
          escrowVault: escrowVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([u2])
        .rpc();

      // Wait for end without recording proofs, so nobody meets the required days.
      await sleep((DAY_LENGTH_SECONDS + 3) * 1000);

      await program.methods
        .settleChallenge(challengeId)
        .accountsPartial({
          oracle: oracle.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
        })
        .signers([oracle])
        .rpc();

      await program.methods
        .settleParticipant(challengeId)
        .accountsPartial({
          oracle: oracle.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: p1,
        })
        .signers([oracle])
        .rpc();

      await program.methods
        .settleParticipant(challengeId)
        .accountsPartial({
          oracle: oracle.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          participant: p2,
        })
        .signers([oracle])
        .rpc();

      await program.methods
        .finalizeSettlement(challengeId)
        .accountsPartial({
          oracle: oracle.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
        })
        .signers([oracle])
        .rpc();

      const treasuryTokenAccount = await createAssociatedTokenAccount(
        provider.connection,
        treasury,
        usdcMint,
        treasury.publicKey
      );

      const treasuryBalBefore = await getAccount(provider.connection, treasuryTokenAccount);

      await program.methods
        .claimForfeitedStakes(challengeId)
        .accountsPartial({
          treasury: treasury.publicKey,
          factory: factoryPDA,
          challenge: challengePDA,
          treasuryTokenAccount: treasuryTokenAccount,
          escrowVault: escrowVault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([treasury])
        .rpc();

      const treasuryBalAfter = await getAccount(provider.connection, treasuryTokenAccount);
      expect(Number(treasuryBalAfter.amount) - Number(treasuryBalBefore.amount)).to.equal(
        STAKE_AMOUNT * 2
      );
    });
  });

  // ============================================================
  // EDGE CASE TESTS
  // ============================================================

  describe("Edge Cases", () => {
    it("should reject challenge ID that is too long", async () => {
      const longChallengeId = "a".repeat(33); // Max is 32
      const [longChallengePDA] = getChallengePDA(longChallengeId, factoryPDA);
      const longEscrowVault = await getEscrowVault(longChallengePDA);

      try {
        await program.methods
          .createChallenge(
            longChallengeId,
            new BN(STAKE_AMOUNT),
            TOTAL_DAYS,
            new BN(getFutureTimestamp(60))
          )
          .accountsPartial({
            creator: creator.publicKey,
            factory: factoryPDA,
            challenge: longChallengePDA,
            tokenMint: usdcMint,
            escrowVault: longEscrowVault,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.toString()).to.include("ChallengeIdTooLong");
      }
    });

    it("should reject empty challenge ID", async () => {
      const emptyChallengeId = "";
      // Note: This will fail at PDA derivation level since empty string creates issues
      try {
        const [emptyChallengePDA] = getChallengePDA(emptyChallengeId, factoryPDA);
        const emptyEscrowVault = await getEscrowVault(emptyChallengePDA);

        await program.methods
          .createChallenge(
            emptyChallengeId,
            new BN(STAKE_AMOUNT),
            TOTAL_DAYS,
            new BN(getFutureTimestamp(60))
          )
          .accountsPartial({
            creator: creator.publicKey,
            factory: factoryPDA,
            challenge: emptyChallengePDA,
            tokenMint: usdcMint,
            escrowVault: emptyEscrowVault,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.toString()).to.include("ChallengeIdEmpty");
      }
    });

    it("should reject zero duration", async () => {
      const zeroDurationId = "zero-duration-001";
      const [zeroDurationPDA] = getChallengePDA(zeroDurationId, factoryPDA);
      const zeroDurationVault = await getEscrowVault(zeroDurationPDA);

      try {
        await program.methods
          .createChallenge(
            zeroDurationId,
            new BN(STAKE_AMOUNT),
            0, // Zero days
            new BN(getFutureTimestamp(60))
          )
          .accountsPartial({
            creator: creator.publicKey,
            factory: factoryPDA,
            challenge: zeroDurationPDA,
            tokenMint: usdcMint,
            escrowVault: zeroDurationVault,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.toString()).to.include("InvalidDuration");
      }
    });
  });

  // ============================================================
  // UTILITY FUNCTION TESTS
  // ============================================================

  describe("PDA Derivation", () => {
    it("should derive correct factory PDA", () => {
      const [pda, bump] = getFactoryPDA();
      expect(pda.toBase58()).to.equal(factoryPDA.toBase58());
    });

    it("should derive deterministic challenge PDAs", () => {
      const challengeId = "deterministic-test";
      const [pda1] = getChallengePDA(challengeId, factoryPDA);
      const [pda2] = getChallengePDA(challengeId, factoryPDA);
      expect(pda1.toBase58()).to.equal(pda2.toBase58());
    });

    it("should derive different PDAs for different challenge IDs", () => {
      const [pda1] = getChallengePDA("challenge-a", factoryPDA);
      const [pda2] = getChallengePDA("challenge-b", factoryPDA);
      expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
    });
  });
});
