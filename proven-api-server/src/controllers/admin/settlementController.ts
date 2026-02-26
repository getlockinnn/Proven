import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { logAdminAction, AuditActions } from '../../services/auditService';
import { settleDayForChallenge, runDailySettlement } from '../../services/dailySettlement';
import {
  getFailedJobs,
  retryJob,
  getPayoutStats,
  getRecentPayouts,
  createPayoutJob,
} from '../../services/payoutQueue';
import { updateAllChallengeStatuses } from '../../services/challengeCompletionService';
import { escrowService } from '../../services/escrowService';
import { getChallengeDayBoundary, getChallengeTotalDays } from '../../utils/timeUtils';
import { logger } from '../../lib/logger';

/**
 * POST /admin/settlements/run — Trigger daily settlement manually
 */
export const triggerDailySettlement = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    await runDailySettlement();

    await logAdminAction({
      action: 'settlement_triggered',
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: 'system',
      details: 'Manual daily settlement triggered',
      type: 'SUCCESS',
    });

    res.json({ success: true, message: 'Daily settlement triggered successfully' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to trigger settlement', { error: msg });
    res.status(500).json({ success: false, message: 'Failed to trigger settlement', error: msg });
  }
};

/**
 * POST /admin/settlements/:challengeId/:dayDate — Settle specific day
 */
export const settleDay = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { challengeId, dayDate } = req.params;
    const settlement = await settleDayForChallenge(challengeId, dayDate);

    await logAdminAction({
      action: 'settlement_day',
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: challengeId,
      details: `Settled day ${dayDate} for challenge`,
      type: 'SUCCESS',
      metadata: {
        dayDate,
        showedUp: settlement.showedUp,
        missed: settlement.missed,
        bonusPerPerson: settlement.bonusPerPerson,
      },
    });

    res.json({ success: true, data: settlement });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to settle day', { error: msg });
    res.status(500).json({ success: false, message: 'Failed to settle day', error: msg });
  }
};

/**
 * GET /admin/payouts/failed — List failed payouts
 */
export const getFailedPayouts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const challengeId = req.query.challengeId as string | undefined;
    const jobs = await getFailedJobs(challengeId);
    res.json({ success: true, data: jobs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch failed payouts' });
  }
};

/**
 * POST /admin/payouts/:jobId/retry — Retry a failed payout
 */
export const retryPayout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { jobId } = req.params;
    const { walletAddress } = req.body as { walletAddress?: string };

    // If admin provides a wallet address, update the job before retrying
    if (walletAddress) {
      await prisma.payoutJob.update({
        where: { id: jobId },
        data: { walletAddress },
      });
    }

    await retryJob(jobId);

    await logAdminAction({
      action: 'payout_retry',
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: jobId,
      details: `Retried payout job ${jobId}${walletAddress ? ` with wallet ${walletAddress}` : ''}`,
      type: 'INFO',
    });

    res.json({ success: true, message: 'Payout job queued for retry' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retry payout' });
  }
};

/**
 * POST /admin/payouts/retry-all — Retry all failed payouts for a challenge
 */
export const retryAllPayouts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const challengeId = req.body.challengeId as string | undefined;
    const jobs = await getFailedJobs(challengeId);

    let retried = 0;
    for (const job of jobs) {
      await retryJob(job.id);
      retried++;
    }

    await logAdminAction({
      action: 'payout_retry_all',
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: challengeId || 'all',
      details: `Retried ${retried} failed payout jobs`,
      type: 'INFO',
    });

    res.json({ success: true, message: `${retried} payout jobs queued for retry` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retry payouts' });
  }
};

/**
 * GET /admin/payouts/status — Payout queue dashboard stats
 */
export const getPayoutStatus = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const stats = await getPayoutStats();
    const recent = await getRecentPayouts(20);
    res.json({ success: true, data: { stats, recent } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch payout status' });
  }
};

/**
 * POST /admin/challenges/:id/close — Final close: update statuses + sweep dust
 */
export const closeChallenge = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: {
        userChallenges: {
          select: { id: true, userId: true, status: true, stakeAmount: true },
        },
        dailySettlements: true,
      },
    });

    if (!challenge) {
      res.status(404).json({ success: false, message: 'Challenge not found' });
      return;
    }

    if (challenge.payoutsFinalized) {
      res.status(400).json({ success: false, message: 'Challenge payouts already finalized' });
      return;
    }

    // 1. Update all user statuses
    const statusResults = await updateAllChallengeStatuses(id);

    // 2. Sweep remaining dust to treasury
    let dustSweepResult: { amount: number; tx?: string; error?: string } | null = null;

    if (challenge.escrowAddress && process.env.TREASURY_ADDRESS) {
      try {
        const balance = await escrowService.getEscrowBalance(challenge.escrowAddress);
        if (balance > 0.001) { // more than dust threshold
          const boundary = getChallengeDayBoundary();
          const toDateKey = boundary.getClientDateKey;
          const totalDays = getChallengeTotalDays(
            new Date(challenge.startDate),
            new Date(challenge.endDate),
            toDateKey
          );
          const dustMicroUsdc = Math.floor(balance * 1_000_000);

          await createPayoutJob({
            userId: challenge.creatorId,
            challengeId: id,
            amount: dustMicroUsdc,
            type: 'DUST_SWEEP',
            dayDate: boundary.todayStr,
            walletAddress: process.env.TREASURY_ADDRESS,
          });

          dustSweepResult = { amount: balance };
        } else {
          dustSweepResult = { amount: balance };
        }
      } catch (err) {
        dustSweepResult = {
          amount: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    // 3. Mark challenge as finalized
    await prisma.challenge.update({
      where: { id },
      data: {
        payoutsFinalized: true,
        isCompleted: true,
        completedAt: new Date(),
      },
    });

    await logAdminAction({
      action: 'challenge_closed',
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: id,
      details: `Closed challenge: ${statusResults.completed} completed, ${statusResults.failed} failed`,
      type: 'SUCCESS',
      metadata: {
        statusResults,
        dustSweep: dustSweepResult,
        settlementsCount: challenge.dailySettlements.length,
      },
    });

    res.json({
      success: true,
      message: 'Challenge closed successfully',
      data: {
        statusResults,
        dustSweep: dustSweepResult,
        settlementsCompleted: challenge.dailySettlements.length,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to close challenge', { error: msg });
    res.status(500).json({ success: false, message: 'Failed to close challenge', error: msg });
  }
};
