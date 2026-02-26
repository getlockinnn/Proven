import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { logAdminAction, AuditActions } from '../../services/auditService';

/**
 * Pause or resume a challenge
 * @route POST /api/admin/challenges/:id/pause
 * @access Private (Admin only)
 */
export const pauseChallenge = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { pause } = req.body; // true = pause, false = resume

    const challenge = await prisma.challenge.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        isPaused: true,
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

    // Check if challenge is active (between start and end date)
    const now = new Date();
    if (now < challenge.startDate) {
      res.status(400).json({
        success: false,
        message: 'Cannot pause a challenge that has not started yet',
      });
      return;
    }

    if (now > challenge.endDate) {
      res.status(400).json({
        success: false,
        message: 'Cannot pause a challenge that has already ended',
      });
      return;
    }

    // Check if already in desired state
    if (challenge.isPaused === pause) {
      res.status(400).json({
        success: false,
        message: pause ? 'Challenge is already paused' : 'Challenge is not paused',
      });
      return;
    }

    // Update challenge
    const updated = await prisma.challenge.update({
      where: { id },
      data: {
        isPaused: pause,
        pausedAt: pause ? new Date() : null,
      },
    });

    // Log admin action
    await logAdminAction({
      action: pause ? AuditActions.CHALLENGE_PAUSED : AuditActions.CHALLENGE_RESUMED,
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: challenge.id,
      details: pause
        ? `Paused challenge "${challenge.title}"`
        : `Resumed challenge "${challenge.title}"`,
      type: 'WARNING',
      metadata: {
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        action: pause ? 'paused' : 'resumed',
        timestamp: new Date().toISOString(),
      },
    });

    res.json({
      success: true,
      message: pause
        ? 'Challenge paused successfully'
        : 'Challenge resumed successfully',
      data: {
        id: updated.id,
        title: challenge.title,
        isPaused: updated.isPaused,
        pausedAt: updated.pausedAt,
      },
    });
  } catch (error) {
    console.error('Error pausing/resuming challenge:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to pause/resume challenge',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
