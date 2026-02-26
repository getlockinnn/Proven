import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';

/**
 * Get participants for a specific challenge
 * @route GET /api/admin/challenges/:id/participants
 * @access Private (Admin only)
 */
export const getParticipants = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const challenge = await prisma.challenge.findUnique({
      where: { id },
      select: {
        id: true,
        startDate: true,
        endDate: true,
      },
    });

    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found',
      });
      return;
    }

    const totalDays = Math.ceil(
      (challenge.endDate.getTime() - challenge.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const [participants, totalCount] = await Promise.all([
      prisma.userChallenge.findMany({
        where: { challengeId: id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              walletAddress: true,
              image: true,
              email: true,
            },
          },
          submissions: {
            select: {
              id: true,
              status: true,
              submissionDate: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.userChallenge.count({ where: { challengeId: id } }),
    ]);

    const enrichedParticipants = participants.map((p) => {
      const approvedSubmissions = p.submissions.filter((s) => s.status === 'APPROVED').length;
      const rejectedSubmissions = p.submissions.filter((s) => s.status === 'REJECTED').length;
      const missedDays = Math.max(0, totalDays - approvedSubmissions - rejectedSubmissions);

      return {
        id: p.id,
        name: p.user.name,
        wallet: p.user.walletAddress,
        email: p.user.email,
        image: p.user.image,
        daysCompleted: approvedSubmissions,
        totalDays,
        status: p.status.toLowerCase() as 'active' | 'dropped' | 'completed',
        missedDays,
        progress: p.progress,
        stakeAmount: p.stakeAmount,
        joinedAt: p.createdAt,
      };
    });

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: {
        participants: enrichedParticipants,
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
    console.error('Error fetching participants:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch participants',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
