import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { logAdminAction, AuditActions, formatWallet } from '../../services/auditService';
import { getChallengeDayBoundary, getChallengeDayNumber } from '../../utils/timeUtils';

/**
 * Reject a proof submission
 * @route POST /api/admin/proofs/:id/reject
 * @access Private (Admin only)
 */
export const rejectProof = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason, category } = req.body;

    const submission = await prisma.submission.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, walletAddress: true },
        },
        challenge: {
          select: { id: true, title: true, startDate: true },
        },
      },
    });

    if (!submission) {
      res.status(404).json({
        success: false,
        message: "We couldn't find this submission. It may have been removed.",
        code: 'PROOF_NOT_FOUND',
      });
      return;
    }

    if (submission.status !== 'PENDING') {
      res.status(400).json({
        success: false,
        message: `This submission has already been ${submission.status.toLowerCase()}.`,
        code: 'ALREADY_REVIEWED',
      });
      return;
    }

    const challengeDateKey = getChallengeDayBoundary().getClientDateKey;
    const challengeStart = new Date(submission.challenge.startDate);
    const submissionDate = new Date(submission.submissionDate);
    const dayNumber = getChallengeDayNumber(challengeStart, submissionDate, challengeDateKey);

    // Update submission
    const result = await prisma.submission.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedBy: req.user?.id,
        reviewedAt: new Date(),
        reviewComments: `[${category}] ${reason}`,
      },
    });

    // Log admin action
    await logAdminAction({
      action: AuditActions.PROOF_REJECTED,
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: formatWallet(submission.user.walletAddress || submission.user.id),
      details: `Rejected Day ${dayNumber} proof for ${submission.challenge.title}: ${reason}`,
      type: 'DESTRUCTIVE',
      metadata: {
        submissionId: id,
        challengeId: submission.challenge.id,
        userId: submission.user.id,
        dayNumber,
        reason,
        category,
      },
    });

    res.json({
      success: true,
      message: 'Proof rejected',
      data: {
        id: result.id,
        status: result.status,
        reviewedAt: result.reviewedAt,
        reviewComments: result.reviewComments,
      },
    });
  } catch (error) {
    console.error('Error rejecting proof:', error);
    res.status(500).json({
      success: false,
      message: "We couldn't reject this proof right now. Please try again.",
      code: 'REJECT_FAILED',
      ...(process.env.NODE_ENV === 'development' && { debug: error }),
    });
  }
};
