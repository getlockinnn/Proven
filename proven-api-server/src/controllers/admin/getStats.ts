import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { escrowService } from '../../services/escrowService';

/**
 * Get dashboard statistics for admin panel
 * @route GET /api/admin/stats
 * @access Private (Admin only)
 */
export const getStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    // Run all queries in parallel
    const [
      activeChallenges,
      totalParticipants,
      pendingProofs,
      activeEscrowChallenges,
      newChallengesThisWeek,
      newParticipantsToday,
      proofsSubmittedToday,
      missedToday,
      recentPayouts,
    ] = await Promise.all([
      // Active challenges count
      prisma.challenge.count({
        where: {
          startDate: { lte: now },
          endDate: { gte: now },
        },
      }),

      // Total active participants (in active challenges)
      prisma.userChallenge.count({
        where: {
          status: 'ACTIVE',
        },
      }),

      // Pending proofs
      prisma.submission.count({
        where: { status: 'PENDING' },
      }),

      // Active challenges that have escrow wallets (for live on-chain escrow totals)
      prisma.challenge.findMany({
        where: {
          startDate: { lte: now },
          endDate: { gte: now },
          escrowAddress: { not: null },
        },
        select: {
          id: true,
          escrowAddress: true,
        },
      }),

      // New challenges this week
      prisma.challenge.count({
        where: {
          createdAt: { gte: weekStart },
        },
      }),

      // New participants today
      prisma.userChallenge.count({
        where: {
          createdAt: { gte: todayStart },
        },
      }),

      // Proofs submitted today
      prisma.submission.count({
        where: {
          submissionDate: { gte: todayStart },
        },
      }),

      // Missed submissions today (users who haven't submitted but should have)
      // This is an approximation - count active user challenges without a submission today
      prisma.userChallenge.count({
        where: {
          status: 'ACTIVE',
          challenge: {
            startDate: { lte: now },
            endDate: { gte: now },
          },
          submissions: {
            none: {
              submissionDate: { gte: todayStart },
            },
          },
        },
      }),

      // Recent payouts (completed transactions in last 24h)
      prisma.transaction.aggregate({
        where: {
          transactionType: 'REWARD',
          status: 'COMPLETED',
          createdAt: { gte: todayStart },
        },
        _sum: { amount: true },
      }),
    ]);

    // Calculate urgent pending proofs (older than 24 hours)
    const urgentCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const urgentProofs = await prisma.submission.count({
      where: {
        status: 'PENDING',
        submissionDate: { lt: urgentCutoff },
      },
    });

    // Live on-chain escrow total across active challenges
    const escrowBalances = await Promise.all(
      activeEscrowChallenges.map(async (challenge) => {
        if (!challenge.escrowAddress) return 0;
        try {
          return await escrowService.getEscrowBalance(challenge.escrowAddress);
        } catch (error) {
          console.warn(`Failed to fetch on-chain escrow balance for challenge ${challenge.id}:`, error);
          return 0;
        }
      })
    );
    const escrowTotalOnChain = Number(
      escrowBalances.reduce((sum, balance) => sum + balance, 0).toFixed(6)
    );

    res.json({
      success: true,
      data: {
        activeChallenges: {
          value: activeChallenges,
          change: `+${newChallengesThisWeek} this week`,
        },
        totalParticipants: {
          value: totalParticipants,
          change: `+${newParticipantsToday} today`,
        },
        escrowTotal: {
          value: escrowTotalOnChain,
          formatted: `$${escrowTotalOnChain.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
        },
        pendingProofs: {
          value: pendingProofs,
          urgent: urgentProofs,
        },
        missedToday: {
          value: missedToday,
        },
        dailyPayouts: {
          value: recentPayouts._sum.amount || 0,
          formatted: `$${(recentPayouts._sum.amount || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
        },
        proofsSubmittedToday: proofsSubmittedToday,
      },
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin statistics',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
