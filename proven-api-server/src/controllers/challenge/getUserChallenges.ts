import { Response } from 'express';
import { ChallengeStatus, Prisma } from '@prisma/client';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { getChallengeDayBoundary, getChallengeDayNumber, getChallengeTotalDays } from '../../utils/timeUtils';

/**
 * Get user's challenges
 * @route GET /api/challenges/user
 * @access Private (requires authentication)
 */
export const getUserChallenges = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Ensure user is authenticated
    if (!req.user || !req.user.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    // Get the authenticated user's ID
    const userId = req.user.id;

    const {
      todayStr,
      todayMidnightUTC,
      tomorrowMidnightUTC,
      getClientDateKey,
      timeZone
    } = getChallengeDayBoundary();

    // Get status filter from query params if provided
    const { status } = req.query;

    // Build where clause
    const whereClause: Prisma.UserChallengeWhereInput = { userId };

    // Add status filter if provided
    if (status && typeof status === 'string') {
      const normalizedStatus = status.toUpperCase();
      if (
        normalizedStatus === ChallengeStatus.ACTIVE ||
        normalizedStatus === ChallengeStatus.COMPLETED ||
        normalizedStatus === ChallengeStatus.FAILED
      ) {
        whereClause.status = normalizedStatus;
      }
    }

    // Get user challenges with related challenge data
    const userChallenges = await prisma.userChallenge.findMany({
      where: whereClause,
      include: {
        challenge: {
          include: {
            creator: true
          }
        }
      },
      orderBy: {
        startDate: 'desc'
      }
    });

    // Also fetch today's submissions for these challenges
    const activeChallengeIds = userChallenges
      .filter(uc => uc.status === 'ACTIVE')
      .map(uc => uc.challengeId);

    const todaysSubmissions = await prisma.submission.findMany({
      where: {
        userId,
        challengeId: { in: activeChallengeIds },
        submissionDate: {
          gte: todayMidnightUTC,
          lt: tomorrowMidnightUTC
        }
      },
      orderBy: { submissionDate: 'desc' }
    });

    const latestSubmissionByChallenge = new Map();
    for (const sub of todaysSubmissions) {
      if (!latestSubmissionByChallenge.has(sub.challengeId)) {
        latestSubmissionByChallenge.set(sub.challengeId, sub);
      }
    }

    // Transform the data to match the frontend interface
    const transformedUserChallenges = userChallenges.map(userChallenge => {
      const challenge = userChallenge.challenge;
      const chStartStr = getClientDateKey(new Date(challenge.startDate));
      const chEndExclusiveStr = getClientDateKey(new Date(challenge.endDate));
      const totalDays = getChallengeTotalDays(
        new Date(challenge.startDate),
        new Date(challenge.endDate),
        getClientDateKey
      );
      const currentDayNumber = todayStr < chStartStr
        ? 0
        : todayStr >= chEndExclusiveStr
          ? totalDays
          : getChallengeDayNumber(new Date(challenge.startDate), new Date(), getClientDateKey, totalDays);

      let todayStatus: 'not_submitted' | 'submitted' | 'approved' | 'rejected' | 'locked' = 'not_submitted';

      if (userChallenge.status === 'ACTIVE') {
        if (todayStr >= chEndExclusiveStr) {
          todayStatus = 'locked';
        } else if (todayStr < chStartStr) {
          todayStatus = 'locked';
        } else {
          const sub = latestSubmissionByChallenge.get(challenge.id);
          if (sub) {
            const submissionStatus = sub.status.toLowerCase();
            if (submissionStatus === 'pending') {
              todayStatus = 'submitted';
            } else if (submissionStatus === 'approved') {
              todayStatus = 'approved';
            } else if (submissionStatus === 'rejected') {
              todayStatus = 'rejected';
            } else {
              todayStatus = 'submitted';
            }
          }
        }
      } else {
        todayStatus = 'locked'; // Only ACTIVE challenges are actionable for "today"
      }

      return {
        id: userChallenge.id,
        challengeId: challenge.id,
        userId: userChallenge.userId,
        status: userChallenge.status,
        todayStatus, // Add todayStatus consistently evaluated with backend bounds
        currentDayNumber,
        challengeTimezone: timeZone,
        // Progress is stored as 0-100 percentage in backend
        progress: userChallenge.progress,
        startDate: userChallenge.startDate.toISOString(),
        endDate: userChallenge.endDate ? userChallenge.endDate.toISOString() : null,
        stakeAmount: userChallenge.stakeAmount,
        challenge: {
          id: challenge.id,
          title: challenge.title,
          type: challenge.verificationType,
          sponsor: challenge.creator?.name || 'Unknown',
          duration: `${Math.ceil((challenge.endDate.getTime() - challenge.startDate.getTime()) / (1000 * 60 * 60 * 24))} days`,
          difficulty: challenge.difficulty,
          userStake: userChallenge.stakeAmount,
          totalPrizePool: challenge.stakeAmount * 2,
          participants: 0,
          metrics: challenge.metrics,
          trackingMetrics: challenge.rules || [],
          image: challenge.image || process.env.DEFAULT_CHALLENGE_IMAGE_URL,
          description: challenge.description || '',
          reward: userChallenge.stakeAmount * 2,
          startDate: challenge.startDate.toISOString(),
          endDate: challenge.endDate.toISOString()
        }
      };
    });

    res.status(200).json({
      success: true,
      userChallenges: transformedUserChallenges,
      count: transformedUserChallenges.length
    });
    return;
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user challenges',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return;
  }
};
