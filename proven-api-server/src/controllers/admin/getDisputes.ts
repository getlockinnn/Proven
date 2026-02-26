import { Response } from 'express';
import { DisputeStatus, Prisma } from '@prisma/client';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { getChallengeDayBoundary, getChallengeDayNumber } from '../../utils/timeUtils';

/**
 * Get all disputes for admin review
 * @route GET /api/admin/disputes
 * @access Private (Admin only)
 */
export const getDisputes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const skip = (page - 1) * limit;

    // Build where condition
    const whereCondition: Prisma.DisputeWhereInput = {};

    if (status && status !== 'all') {
      const normalizedStatus = status.toUpperCase();
      if (normalizedStatus === DisputeStatus.PENDING || normalizedStatus === DisputeStatus.RESOLVED) {
        whereCondition.status = normalizedStatus;
      }
    }

    const [disputes, totalCount] = await Promise.all([
      prisma.dispute.findMany({
        where: whereCondition,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              walletAddress: true,
            },
          },
          submission: {
            include: {
              challenge: {
                select: {
                  id: true,
                  title: true,
                  startDate: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dispute.count({ where: whereCondition }),
    ]);

    const challengeDateKey = getChallengeDayBoundary().getClientDateKey;
    const enrichedDisputes = disputes.map((dispute) => {
      const challengeStart = new Date(dispute.submission.challenge.startDate);
      const submissionDate = new Date(dispute.submission.submissionDate);
      const proofDay = getChallengeDayNumber(challengeStart, submissionDate, challengeDateKey);

      // Calculate time since submission
      const msSinceCreated = Date.now() - dispute.createdAt.getTime();
      const hoursSince = Math.floor(msSinceCreated / (1000 * 60 * 60));
      const submittedAt =
        hoursSince < 1
          ? `${Math.floor(msSinceCreated / (1000 * 60))} min ago`
          : hoursSince < 24
          ? `${hoursSince} hours ago`
          : `${Math.floor(hoursSince / 24)} days ago`;

      return {
        id: dispute.id,
        user: dispute.user.walletAddress
          ? `${dispute.user.walletAddress.slice(0, 6)}...${dispute.user.walletAddress.slice(-4)}`
          : dispute.user.name || 'Unknown',
        userId: dispute.user.id,
        challenge: dispute.submission.challenge.title,
        challengeId: dispute.submission.challenge.id,
        proofDay,
        reason: dispute.reason,
        submittedAt,
        createdAt: dispute.createdAt,
        status: dispute.status.toLowerCase() as 'pending' | 'resolved',
        originalDecision: dispute.originalDecision,
        resolution: dispute.resolution,
        resolvedAt: dispute.resolvedAt,
      };
    });

    // Calculate stats
    const pendingCount = await prisma.dispute.count({ where: { status: 'PENDING' } });
    const resolvedThisWeek = await prisma.dispute.count({
      where: {
        status: 'RESOLVED',
        resolvedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: {
        disputes: enrichedDisputes,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          limit,
        },
        stats: {
          pendingReview: pendingCount,
          resolvedThisWeek,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching disputes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch disputes',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
