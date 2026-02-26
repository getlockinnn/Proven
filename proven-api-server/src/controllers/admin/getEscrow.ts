import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';

/**
 * Get escrow data for all challenges
 * @route GET /api/admin/escrow
 * @access Private (Admin only)
 */
export const getEscrow = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();

    // Get all challenges with escrow and transaction data
    const challenges = await prisma.challenge.findMany({
      include: {
        userChallenges: {
          select: {
            stakeAmount: true,
            status: true,
          },
        },
        transactions: {
          select: {
            transactionType: true,
            amount: true,
            status: true,
          },
        },
        escrowWallet: {
          select: {
            publicKey: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const escrowData = challenges.map((challenge) => {
      const isActive = challenge.startDate <= now && challenge.endDate >= now;
      const isUpcoming = challenge.startDate > now;
      const status = challenge.endDate < now ? 'completed' : isUpcoming ? 'upcoming' : 'active';

      // Calculate totals
      const totalLocked = challenge.userChallenges.reduce(
        (sum, uc) => sum + uc.stakeAmount,
        0
      );

      const paidOut = challenge.transactions
        .filter((t) => t.transactionType === 'REWARD' && t.status === 'COMPLETED')
        .reduce((sum, t) => sum + t.amount, 0);

      const pendingRewards = challenge.transactions
        .filter((t) => t.transactionType === 'REWARD' && t.status === 'PENDING')
        .reduce((sum, t) => sum + t.amount, 0);

      const claimable = pendingRewards;

      return {
        challengeId: challenge.id,
        challenge: challenge.title,
        totalLocked: status === 'completed' ? 0 : totalLocked,
        claimable,
        paidOut,
        participants: challenge.userChallenges.length,
        status,
        escrowAddress: challenge.escrowWallet?.publicKey,
      };
    });

    // Calculate global stats
    const globalStats = {
      totalInEscrow: escrowData
        .filter((e) => e.status === 'active')
        .reduce((sum, e) => sum + e.totalLocked, 0),
      pendingClaims: escrowData.reduce((sum, e) => sum + e.claimable, 0),
      totalPaidOut: escrowData.reduce((sum, e) => sum + e.paidOut, 0),
    };

    res.json({
      success: true,
      data: {
        escrow: escrowData,
        stats: globalStats,
      },
    });
  } catch (error) {
    console.error('Error fetching escrow:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch escrow data',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
