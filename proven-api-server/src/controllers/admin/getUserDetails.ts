import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';

/**
 * Get detailed user info for admin panel
 * @route GET /api/admin/users/:id
 * @access Private (Admin only)
 */
export const getUserDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        userChallenges: {
          include: {
            challenge: {
              select: {
                id: true,
                title: true,
                startDate: true,
                endDate: true,
                stakeAmount: true,
              },
            },
            submissions: {
              select: {
                id: true,
                status: true,
                submissionDate: true,
              },
              orderBy: { submissionDate: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        disputes: {
          include: {
            submission: {
              select: {
                id: true,
                challengeId: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Calculate stats
    const activeChallenges = user.userChallenges.filter(
      (uc) => uc.status === 'ACTIVE'
    ).length;
    const completedChallenges = user.userChallenges.filter(
      (uc) => uc.status === 'COMPLETED'
    ).length;
    const failedChallenges = user.userChallenges.filter(
      (uc) => uc.status === 'FAILED'
    ).length;

    const totalEarned = user.transactions
      .filter((t) => t.transactionType === 'REWARD' && t.status === 'COMPLETED')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalStaked = user.userChallenges
      .filter((uc) => uc.status === 'ACTIVE')
      .reduce((sum, uc) => sum + uc.stakeAmount, 0);

    // Format challenge history
    const challengeHistory = user.userChallenges.map((uc) => ({
      id: uc.id,
      challengeId: uc.challenge.id,
      title: uc.challenge.title,
      status: uc.status.toLowerCase(),
      progress: uc.progress,
      stakeAmount: uc.stakeAmount,
      startDate: uc.startDate,
      endDate: uc.endDate,
      submissionsCount: uc.submissions.length,
      approvedCount: uc.submissions.filter((s) => s.status === 'APPROVED').length,
      rejectedCount: uc.submissions.filter((s) => s.status === 'REJECTED').length,
    }));

    res.json({
      success: true,
      data: {
        id: user.id,
        walletAddress: user.walletAddress,
        name: user.name,
        email: user.email,
        image: user.image,
        bio: user.bio,
        isAdmin: user.isAdmin,
        flagged: user.isFlagged,
        flagReason: user.flagReason,
        blocked: user.isBlocked,
        createdAt: user.createdAt,
        stats: {
          activeChallenges,
          completedChallenges,
          failedChallenges,
          totalEarned,
          totalStaked,
          totalDisputes: user.disputes.length,
        },
        challengeHistory,
        recentTransactions: user.transactions,
        disputes: user.disputes,
      },
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
