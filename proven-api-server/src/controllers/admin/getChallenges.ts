import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { getChallengeDayBoundary, getChallengeTotalDays } from '../../utils/timeUtils';

/**
 * Get all challenges for admin panel with enhanced data
 * @route GET /api/admin/challenges
 * @access Private (Admin only)
 */
export const getChallenges = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const search = req.query.search as string;
    const skip = Math.max((page - 1) * limit, 0);
    const challengeDayBoundary = getChallengeDayBoundary();

    // Build where condition
    const whereCondition: Prisma.ChallengeWhereInput = {};

    if (search) {
      whereCondition.title = { contains: search, mode: 'insensitive' };
    }

    const challenges = await prisma.challenge.findMany({
      where: whereCondition,
      include: {
        _count: {
          select: { userChallenges: true, submissions: true },
        },
        userChallenges: {
          select: { stakeAmount: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Enrich challenges with computed fields
    const enrichedChallenges = challenges.map((challenge) => {
      const startKey = challengeDayBoundary.getClientDateKey(new Date(challenge.startDate));
      const endExclusiveKey = challengeDayBoundary.getClientDateKey(new Date(challenge.endDate));
      const todayKey = challengeDayBoundary.todayStr;

      const isUpcoming = todayKey < startKey;
      const isCompleted = todayKey >= endExclusiveKey;

      const poolSize = challenge.userChallenges.reduce(
        (sum, uc) => sum + uc.stakeAmount,
        0
      );

      return {
        id: challenge.id,
        title: challenge.title,
        description: challenge.description,
        category: challenge.difficulty, // Using difficulty as category for now
        duration: getChallengeTotalDays(
          new Date(challenge.startDate),
          new Date(challenge.endDate),
          challengeDayBoundary.getClientDateKey
        ),
        stakeAmount: challenge.stakeAmount,
        status: isCompleted ? 'completed' : isUpcoming ? 'upcoming' : 'active',
        participants: challenge._count.userChallenges,
        poolSize,
        startDate: challenge.startDate.toISOString(),
        endDate: challenge.endDate.toISOString(),
        submissionsCount: challenge._count.submissions,
        image: challenge.image,
        challengeTimezone: challengeDayBoundary.timeZone,
      };
    });

    const statusFilteredChallenges =
      status && status !== 'all'
        ? enrichedChallenges.filter((challenge) => challenge.status === status)
        : enrichedChallenges;

    const totalCount = statusFilteredChallenges.length;
    const paginatedChallenges = statusFilteredChallenges.slice(skip, skip + limit);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: {
        challenges: paginatedChallenges,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          limit,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching admin challenges:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch challenges',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
