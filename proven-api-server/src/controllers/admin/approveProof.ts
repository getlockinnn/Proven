import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { logAdminAction, AuditActions, formatWallet } from '../../services/auditService';
import { getChallengeDayBoundary, getChallengeDayNumber, getChallengeTotalDays } from '../../utils/timeUtils';
import { createPayoutJob } from '../../services/payoutQueue';
import { logger } from '../../lib/logger';

/**
 * Approve a proof submission
 * @route POST /api/admin/proofs/:id/approve
 * @access Private (Admin only)
 */
export const approveProof = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const submission = await prisma.submission.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, walletAddress: true },
        },
        challenge: {
          select: { id: true, title: true, startDate: true, endDate: true, escrowAddress: true },
        },
        userChallenge: {
          select: { id: true, progress: true, stakeAmount: true, walletAddress: true, userId: true },
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
    const challengeEnd = new Date(submission.challenge.endDate);
    const submissionDate = new Date(submission.submissionDate);
    const totalDays = getChallengeTotalDays(challengeStart, challengeEnd, challengeDateKey);
    const dayNumber = getChallengeDayNumber(challengeStart, submissionDate, challengeDateKey, totalDays);

    // Derive the dateKey for the submission day (used for payout idempotency)
    const submissionDateKey = challengeDateKey(submissionDate);

    // Calculate progress by unique approved challenge days to avoid double-counting
    // multiple submissions on the same day.
    const approvedSubmissions = await prisma.submission.findMany({
      where: {
        userChallengeId: submission.userChallenge.id,
        status: 'APPROVED',
      },
      select: {
        submissionDate: true,
      },
    });

    const approvedDayKeys = new Set(
      approvedSubmissions.map((approvedSubmission) =>
        challengeDateKey(new Date(approvedSubmission.submissionDate))
      )
    );
    approvedDayKeys.add(submissionDateKey);

    const newProgress = Math.min((approvedDayKeys.size / totalDays) * 100, 100);

    // Update submission and user challenge progress in transaction
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.submission.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedBy: req.user?.id,
          reviewedAt: new Date(),
        },
      });

      await tx.userChallenge.update({
        where: { id: submission.userChallenge.id },
        data: { progress: newProgress },
      });

      return updated;
    });

    // Log admin action
    await logAdminAction({
      action: AuditActions.PROOF_APPROVED,
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: formatWallet(submission.user.walletAddress || submission.user.id),
      details: `Approved Day ${dayNumber} proof for ${submission.challenge.title}`,
      type: 'SUCCESS',
      metadata: {
        submissionId: id,
        challengeId: submission.challenge.id,
        userId: submission.user.id,
        dayNumber,
        newProgress,
      },
    });

    // --- Queue daily base payout via PayoutJob ---
    let payoutInfo: { status: string; amount: number; error?: string } | null = null;

    if (submission.challenge.escrowAddress && submission.userChallenge.stakeAmount > 0) {
      const safeTotalDays = totalDays > 0 ? totalDays : 1;
      const basePayout = Math.floor(
        (submission.userChallenge.stakeAmount * 1_000_000) / safeTotalDays
      );

      const walletAddress = submission.userChallenge.walletAddress
        || submission.user.walletAddress
        || '';
      if (!walletAddress) {
        logger.warn('No wallet address for user, payout worker will attempt DB lookup', {
          userId: submission.userId,
          challengeId: submission.challengeId,
        });
      }

      try {
        await createPayoutJob({
          userId: submission.userChallenge.userId,
          challengeId: submission.challenge.id,
          amount: basePayout,
          type: 'DAILY_BASE',
          dayDate: submissionDateKey,
          walletAddress,
        });

        payoutInfo = {
          status: 'QUEUED',
          amount: basePayout / 1_000_000,
        };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('Failed to create payout job', { error: errorMessage });
        payoutInfo = {
          status: 'ERROR',
          amount: basePayout / 1_000_000,
          error: errorMessage,
        };
      }
    }

    res.json({
      success: true,
      message: 'Proof approved successfully',
      data: {
        id: result.id,
        status: result.status,
        reviewedAt: result.reviewedAt,
        newProgress,
        ...(payoutInfo && { payout: payoutInfo }),
      },
    });
  } catch (error) {
    console.error('Error approving proof:', error);
    res.status(500).json({
      success: false,
      message: "We couldn't approve this proof right now. Please try again.",
      code: 'APPROVE_FAILED',
      ...(process.env.NODE_ENV === 'development' && { debug: error }),
    });
  }
};
