import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { logAdminAction, AuditActions, formatWallet } from '../../services/auditService';
import { getChallengeDayBoundary, getChallengeDayNumber, getChallengeTotalDays } from '../../utils/timeUtils';

/**
 * Resolve a dispute
 * @route POST /api/admin/disputes/:id/resolve
 * @access Private (Admin only)
 */
export const resolveDispute = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { resolution, notes } = req.body; // resolution: 'approved' | 'upheld'

    const dispute = await prisma.dispute.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, walletAddress: true },
        },
        submission: {
          include: {
            challenge: {
              select: { id: true, title: true, startDate: true, endDate: true },
            },
            userChallenge: {
              select: { id: true, progress: true },
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

    if (dispute.status === 'RESOLVED') {
      res.status(400).json({
        success: false,
        message: 'Dispute already resolved',
      });
      return;
    }

    const challengeDateKey = getChallengeDayBoundary().getClientDateKey;
    const challengeStart = new Date(dispute.submission.challenge.startDate);
    const challengeEnd = new Date(dispute.submission.challenge.endDate);
    const submissionDate = new Date(dispute.submission.submissionDate);
    const totalDays = getChallengeTotalDays(challengeStart, challengeEnd, challengeDateKey);
    const dayNumber = getChallengeDayNumber(challengeStart, submissionDate, challengeDateKey, totalDays);

    // Start transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update dispute
      const updatedDispute = await tx.dispute.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolution: notes || (resolution === 'approved' ? 'Appeal approved - decision reversed' : 'Appeal denied - original decision upheld'),
          resolvedBy: req.user?.id,
          resolvedAt: new Date(),
        },
      });

      // If approved, reverse the submission decision
      if (resolution === 'approved') {
        // Calculate new progress
        const approvedCount = await tx.submission.count({
          where: {
            userChallengeId: dispute.submission.userChallenge.id,
            status: 'APPROVED',
          },
        });
        const newProgress = Math.min(((approvedCount + 1) / totalDays) * 100, 100);

        // Update submission to approved
        await tx.submission.update({
          where: { id: dispute.submission.id },
          data: {
            status: 'APPROVED',
            reviewedBy: req.user?.id,
            reviewedAt: new Date(),
            reviewComments: `[DISPUTE RESOLVED] Appeal approved - original rejection reversed`,
          },
        });

        // Update user challenge progress
        await tx.userChallenge.update({
          where: { id: dispute.submission.userChallenge.id },
          data: { progress: newProgress },
        });
      }

      return updatedDispute;
    });

    // Log admin action
    await logAdminAction({
      action: AuditActions.DISPUTE_RESOLVED,
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: formatWallet(dispute.user.walletAddress || dispute.user.id),
      details: `Resolved dispute: ${resolution === 'approved' ? 'Appeal approved - decision reversed' : 'Appeal denied'}`,
      type: resolution === 'approved' ? 'SUCCESS' : 'INFO',
      metadata: {
        disputeId: id,
        submissionId: dispute.submission.id,
        challengeId: dispute.submission.challenge.id,
        resolution,
        dayNumber,
      },
    });

    res.json({
      success: true,
      message: `Dispute resolved - ${resolution === 'approved' ? 'appeal approved' : 'original decision upheld'}`,
      data: {
        id: result.id,
        status: result.status,
        resolution: result.resolution,
        resolvedAt: result.resolvedAt,
      },
    });
  } catch (error) {
    console.error('Error resolving dispute:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve dispute',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
