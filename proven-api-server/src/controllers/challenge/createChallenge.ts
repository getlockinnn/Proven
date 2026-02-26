// import required modules
import { Response } from 'express';
import prisma from '../../lib/prisma';
import { CreateChallengeInput } from '../../schemas/challenge';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { escrowService } from '../../services/escrowService';
import { solanaProgram } from '../../services/solanaProgram';
import { Keypair, PublicKey } from '@solana/web3.js';
import { logger } from '../../lib/logger';
import { getChallengeTimeZone, parseDateInputInTimeZone } from '../../utils/timeUtils';

/**
 * Create a new challenge
 * @route POST /api/challenges/create
 * @access Private (requires authentication + admin)
 */
export const createChallenge = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
      return;
    }

    // Admin access control
    const adminEmailsEnv = process.env.ADMIN_EMAILS || '';
    const adminEmails = adminEmailsEnv.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
    const userEmail = req.user.email?.toLowerCase().trim();

    // Check if user is admin (via role or email list)
    const isAdmin = req.user.isAdmin || (userEmail && adminEmails.includes(userEmail));

    if (!isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Admin access required. Only platform admins can create challenges.',
      });
      return;
    }

    const input: CreateChallengeInput = req.body;
    const userId = req.user.id;

    // Calculate challenge duration in days
    const challengeTimeZone = getChallengeTimeZone();
    const startDate = parseDateInputInTimeZone(input.startDate, challengeTimeZone);
    const endDate = parseDateInputInTimeZone(input.endDate, challengeTimeZone);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const startTs = Math.floor(startDate.getTime() / 1000);

    const challenge = await prisma.challenge.create({
      data: {
        title: input.title,
        description: input.description,
        stakeAmount: input.userStake,
        startDate: startDate,
        endDate: endDate,
        verificationType: input.verificationType || input.type,
        difficulty: input.difficulty,
        metrics: input.metrics,
        creatorId: userId,
        image: input.image,
        rules: input.rules,
        totalPrizePool: input.totalPrizePool || input.userStake * 2,
        participants: input.participants || 0,
        hostType: input.hostType || 'PERSONAL',
        sponsor: input.sponsor,
        trackingMetrics: input.trackingMetrics || [],
      },
      include: {
        creator: true,
      },
    });

    // Try to create challenge on-chain first
    let blockchainId: string | null = null;
    let transactionSignature: string | null = null;
    let escrowAddress: string | null = null;
    let onChainSuccess = false;

    try {
      // Check if factory is initialized and oracle is configured
      const isFactoryReady = await solanaProgram.isFactoryInitialized();
      const oracleKey = solanaProgram.getOraclePublicKey();

      if (isFactoryReady && oracleKey) {
        // Use the challenge ID as the on-chain challenge ID (truncated to 32 bytes if needed)
        const onChainChallengeId = challenge.id.slice(0, 32);

        // Load creator keypair from environment (same as oracle for backend-created challenges)
        const creatorKeypairJson = process.env.ORACLE_KEYPAIR_JSON;
        const creatorKeypairPath = process.env.ORACLE_KEYPAIR_PATH;

        let creatorKeypair: Keypair | null = null;
        if (creatorKeypairJson) {
          creatorKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(creatorKeypairJson)));
        } else if (creatorKeypairPath) {
          const fs = require('fs');
          const keyData = JSON.parse(fs.readFileSync(creatorKeypairPath, 'utf-8'));
          creatorKeypair = Keypair.fromSecretKey(Uint8Array.from(keyData));
        }

        if (creatorKeypair) {
          const result = await solanaProgram.createChallenge(
            creatorKeypair,
            onChainChallengeId,
            input.userStake,
            totalDays,
            startTs
          );

          blockchainId = result.challengePDA.toBase58();
          transactionSignature = result.signature;
          escrowAddress = result.escrowVault.toBase58();
          onChainSuccess = true;

          logger.info(`Challenge created on-chain: ${blockchainId}, tx: ${transactionSignature}`);
        }
      }
    } catch (onChainError: any) {
      logger.warn(`On-chain challenge creation failed, falling back to escrow wallet: ${onChainError.message}`);
    }

    // If on-chain creation failed, fall back to traditional escrow wallet
    if (!onChainSuccess) {
      const escrowWallet = await escrowService.createEscrowWallet(challenge.id);
      escrowAddress = escrowWallet.publicKey;
    }

    // Update challenge with blockchain info
    const challengeWithEscrow = await prisma.challenge.update({
      where: { id: challenge.id },
      data: {
        blockchainId: blockchainId,
        transactionSignature: transactionSignature,
        escrowAddress: escrowAddress,
      },
      include: {
        creator: true,
      },
    });

    if (!challengeWithEscrow) {
      throw new Error('Challenge not found after escrow creation');
    }

    res.json({
      success: true,
      onChain: onChainSuccess,
      challenge: {
        id: challengeWithEscrow.id,
        title: input.title,
        type: input.type,
        sponsor: input.sponsor,
        duration: input.duration,
        userStake: input.userStake,
        totalPrizePool: input.totalPrizePool,
        participants: input.participants,
        metrics: input.metrics,
        trackingMetrics: input.trackingMetrics,
        image: input.image,
        description: input.description,
        rules: input.rules,
        startDate: input.startDate,
        endDate: input.endDate,
        creatorId: userId,
        creator: challengeWithEscrow.creator,
        escrowAddress: challengeWithEscrow.escrowAddress,
        blockchainId: challengeWithEscrow.blockchainId,
        transactionSignature: challengeWithEscrow.transactionSignature,
      },
    });
    return;
  } catch (error: any) {
    const errorMessage = error.message || 'Failed to create challenge';

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: error.code ? { code: error.code, meta: error.meta } : undefined
    });
    return;
  }
};
