import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { getChallengeDayBoundary, getChallengeDayNumber } from '../../utils/timeUtils';

/**
 * Get detailed dispute info
 * @route GET /api/admin/disputes/:id
 * @access Private (Admin only)
 */
export const getDisputeDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            walletAddress: true,
            image: true,
          },
        },
        submission: {
          include: {
            challenge: {
              select: {
                id: true,
                title: true,
                startDate: true,
                endDate: true,
              },
            },
          },
        },
      },
    });

    if (!dispute) {
      res.status(404).json({
        success: false,
        message: 'Dispute not found',
      });
      return;
    }

    const challengeDateKey = getChallengeDayBoundary().getClientDateKey;
    const challengeStart = new Date(dispute.submission.challenge.startDate);
    const submissionDate = new Date(dispute.submission.submissionDate);
    const proofDay = getChallengeDayNumber(challengeStart, submissionDate, challengeDateKey);

    res.json({
      success: true,
      data: {
        id: dispute.id,
        reason: dispute.reason,
        status: dispute.status.toLowerCase(),
        originalDecision: dispute.originalDecision,
        resolution: dispute.resolution,
        resolvedBy: dispute.resolvedBy,
        resolvedAt: dispute.resolvedAt,
        createdAt: dispute.createdAt,
        user: {
          id: dispute.user.id,
          name: dispute.user.name,
          email: dispute.user.email,
          walletAddress: dispute.user.walletAddress,
          image: dispute.user.image,
        },
        submission: {
          id: dispute.submission.id,
          imageUrl: dispute.submission.imageUrl,
          description: dispute.submission.description,
          submissionDate: dispute.submission.submissionDate,
          reviewComments: dispute.submission.reviewComments,
        },
        challenge: {
          id: dispute.submission.challenge.id,
          title: dispute.submission.challenge.title,
        },
        proofDay,
      },
    });
  } catch (error) {
    console.error('Error fetching dispute details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dispute details',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
