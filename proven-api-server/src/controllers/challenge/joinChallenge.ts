import { Response } from 'express';
import { ChallengeStatus, TransactionType, TransactionStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { escrowService } from '../../services/escrowService';

/**
 * Join a challenge
 * @route POST /api/challenges/join
 * @access Private (requires authentication)
 */
export const joinChallenge = async (req: AuthenticatedRequest, res: Response) => {
  try {

    const { challengeId, stakeAmount, userWalletAddress, transactionSignature } = req.body;

    if (!challengeId) {
      res.status(400).json({
        success: false,
        message: 'Please select a challenge to join.',
        code: 'MISSING_CHALLENGE',
      });
      return;
    }

    // Demo mode check - supports multiple demo signature formats
    const isDemoSignature = transactionSignature?.startsWith('demo_') || 
                            transactionSignature?.startsWith('DEMO_') ||
                            transactionSignature === 'DEMO_MODE';
    const isDemoModeEarly = process.env.DEMO_MODE === 'true' || isDemoSignature;

    if (!userWalletAddress && !isDemoModeEarly) {
      res.status(400).json({
        success: false,
        message: 'Please connect your wallet to stake and join this challenge.',
        code: 'WALLET_REQUIRED',
      });
      return;
    }

    // Demo mode: allow joining without real transaction for testing
    const isDemoMode = process.env.DEMO_MODE === 'true' || isDemoSignature;

    if (!transactionSignature && !isDemoMode) {
      res.status(400).json({
        success: false,
        message: 'Please complete the stake transaction in your wallet before joining.',
        code: 'TRANSACTION_REQUIRED',
      });
      return;
    }

    // Authentication is already handled by middleware, but double-check
    if (!req.user || !req.user.id) {
      res.status(401).json({
        success: false,
        message: 'Please sign in to join this challenge.',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    // Get the authenticated user's ID
    const userId = req.user.id;
    
    // Check if challenge exists
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
    });
    
    if (!challenge) {
      res.status(404).json({
        success: false,
        message: "We couldn't find this challenge. It may have been removed or the link is incorrect.",
        code: 'CHALLENGE_NOT_FOUND',
      });
      return;
    }
    
    // Prevent joining a completed challenge
    if (challenge.isCompleted || challenge.endDate <= new Date()) {
      res.status(400).json({
        success: false,
        message: 'This challenge has ended. Check out other upcoming challenges!',
        code: 'CHALLENGE_COMPLETED',
      });
      return;
    }

    // Prevent joining once the challenge has started
    const now = new Date();
    if (challenge.startDate <= now) {
      res.status(400).json({
        success: false,
        message: 'This challenge has already started. Keep an eye out for upcoming challenges you can join!',
        code: 'CHALLENGE_STARTED',
        data: {
          startedAt: challenge.startDate,
        },
      });
      return;
    }

    // Check if user already joined this challenge
    const existingUserChallenge = await prisma.userChallenge.findFirst({
      where: {
        userId: userId,
        challengeId: challengeId,
      },
    });

    if (existingUserChallenge) {
      res.status(400).json({
        success: false,
        message: "You've already joined this challenge. Check your active challenges to continue.",
        code: 'ALREADY_JOINED',
      });
      return;
    }

    // Determine final stake amount
    const finalStakeAmount = stakeAmount || challenge.stakeAmount;

    // Check if challenge has escrow address configured (skip in demo mode)
    if (!challenge.escrowAddress && !isDemoMode) {
      res.status(400).json({
        success: false,
        message: "This challenge isn't fully set up yet. Please try again later or contact support if the issue persists.",
        code: 'ESCROW_NOT_CONFIGURED',
      });
      return;
    }

    // Verify the USDC transfer on-chain (skip in demo mode)
    let isVerified = isDemoMode; // Auto-verify in demo mode
    if (!isDemoMode) {
      try {
        isVerified = await escrowService.verifyTransfer(
          transactionSignature,
          userWalletAddress,
          challenge.escrowAddress!,
          finalStakeAmount
        );

        if (!isVerified) {
          res.status(400).json({
            success: false,
            message: "We couldn't verify your payment. Please make sure you sent the exact stake amount and try again.",
            code: 'TRANSFER_VERIFICATION_FAILED',
          });
          return;
        }
      } catch (error: any) {
        res.status(400).json({
          success: false,
          message: "We couldn't verify your payment. Please check your wallet and try again.",
          code: 'TRANSFER_VERIFICATION_ERROR',
        });
        return;
      }
    }


    // Use a transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Create user challenge record
      const userChallenge = await tx.userChallenge.create({
        data: {
          userId: userId,
          challengeId: challengeId,
          stakeAmount: finalStakeAmount,
          walletAddress: userWalletAddress || undefined,
          status: ChallengeStatus.ACTIVE,
          progress: 0,
          startDate: new Date(),
        },
      });

      // Save wallet address to User if not already set
      if (userWalletAddress) {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { walletAddress: true } });
        if (!user?.walletAddress) {
          await tx.user.update({
            where: { id: userId },
            data: { walletAddress: userWalletAddress },
          });
        }
      }
      
      // Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          userId: userId,
          challengeId: challengeId,
          transactionType: TransactionType.STAKE,
          amount: finalStakeAmount,
          description: `Staked for challenge: ${challenge.title}`,
          status: TransactionStatus.COMPLETED,
          transactionSignature: isDemoMode ? `DEMO_${Date.now()}` : transactionSignature,
          timestamp: new Date(),
          metadata: {
            challengeTitle: challenge.title,
            userWalletAddress: userWalletAddress || 'demo-wallet',
            escrowAddress: challenge.escrowAddress || 'demo-escrow',
            verifiedOnChain: !isDemoMode,
            demoMode: isDemoMode,
            tokenType: 'USDC'
          }
        },
      });
      
      // Update challenge participant count
      const updatedChallenge = await tx.challenge.update({
        where: { id: challengeId },
        data: {
          participants: {
            increment: 1
          }
        }
      });
      
      return { userChallenge, transaction, updatedChallenge };
    });

    res.status(201).json({
      success: true,
      message: 'Successfully joined the challenge',
      data: {
        userChallenge: result.userChallenge,
        transaction: result.transaction,
        stakeAmount: finalStakeAmount,
        challengeTitle: challenge.title,
        transactionSignature
      }
    });
    return;
    
  } catch (error) {
    console.error('Error joining challenge:', error);
    res.status(500).json({
      success: false,
      message: "We couldn't add you to this challenge right now. Please try again, and if the problem continues, contact support.",
      code: 'JOIN_FAILED',
      ...(process.env.NODE_ENV === 'development' && { debug: error }),
    });
    return;
  }
};
