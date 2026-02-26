import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { diffDateKeys, getChallengeDayBoundary, getChallengeTotalDays } from '../../utils/timeUtils';

/**
 * Get detailed challenge info for admin panel
 * @route GET /api/admin/challenges/:id
 * @access Private (Admin only)
 */
export const getChallengeDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const challengeDayBoundary = getChallengeDayBoundary();

    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true, name: true, email: true },
        },
        userChallenges: {
          include: {
            user: {
              select: { id: true, name: true, walletAddress: true, image: true },
            },
            submissions: {
              select: { id: true, status: true, submissionDate: true },
            },
          },
        },
        escrowWallet: {
          select: { publicKey: true },
        },
        _count: {
          select: { submissions: true },
        },
      },
    });

    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found',
      });
      return;
    }

    const startDateKey = challengeDayBoundary.getClientDateKey(new Date(challenge.startDate));
    const endDateExclusiveKey = challengeDayBoundary.getClientDateKey(new Date(challenge.endDate));
    const todayKey = challengeDayBoundary.todayStr;

    const totalDays = getChallengeTotalDays(
      new Date(challenge.startDate),
      new Date(challenge.endDate),
      challengeDayBoundary.getClientDateKey
    );
    const isUpcoming = todayKey < startDateKey;
    const isCompleted = todayKey >= endDateExclusiveKey;
    const status = isCompleted ? 'completed' : isUpcoming ? 'upcoming' : 'active';

    const currentDay = isUpcoming
      ? 0
      : isCompleted
        ? totalDays
        : Math.min(totalDays, diffDateKeys(startDateKey, todayKey) + 1);

    const activeParticipants = challenge.userChallenges.filter(
      (uc) => uc.status === 'ACTIVE'
    ).length;
    const droppedParticipants = challenge.userChallenges.filter(
      (uc) => uc.status === 'FAILED'
    ).length;
    const completedParticipants = challenge.userChallenges.filter(
      (uc) => uc.status === 'COMPLETED'
    ).length;

    const poolSize = challenge.userChallenges.reduce(
      (sum, uc) => sum + uc.stakeAmount,
      0
    );

    const totalApproved = challenge.userChallenges.reduce(
      (sum, uc) => sum + uc.submissions.filter((s) => s.status === 'APPROVED').length,
      0
    );
    const expectedSubmissions = challenge.userChallenges.length * Math.max(currentDay, 1);
    const completionRate =
      expectedSubmissions > 0 ? Math.round((totalApproved / expectedSubmissions) * 100) : 0;

    res.json({
      success: true,
      data: {
        id: challenge.id,
        title: challenge.title,
        description: challenge.description,
        category: challenge.difficulty,
        duration: totalDays,
        currentDay,
        stakeAmount: challenge.stakeAmount,
        status,
        participants: challenge.userChallenges.length,
        poolSize,
        startDate: challenge.startDate.toISOString(),
        endDate: challenge.endDate.toISOString(),
        proofDeadline: `11:59 PM ${challengeDayBoundary.timeZone}`,
        completionRate,
        activeParticipants,
        droppedParticipants,
        completedParticipants,
        creator: challenge.creator,
        escrowAddress: challenge.escrowWallet?.publicKey,
        blockchainId: challenge.blockchainId,
        image: challenge.image,
        totalSubmissions: challenge._count.submissions,
        challengeTimezone: challengeDayBoundary.timeZone,
      },
    });
  } catch (error) {
    console.error('Error fetching challenge details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch challenge details',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
