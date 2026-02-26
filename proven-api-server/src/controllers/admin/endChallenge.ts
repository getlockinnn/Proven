import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { logAdminAction, AuditActions } from '../../services/auditService';

/**
 * End a challenge early
 * @route POST /api/admin/challenges/:id/end
 * @access Private (Admin only)
 */
export const endChallenge = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const challenge = await prisma.challenge.findUnique({
      where: { id },
      include: {
        userChallenges: {
          select: {
            id: true,
            userId: true,
            status: true,
          },
        },
      },
    });

    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found',
      });
      return;
    }

    // Check if challenge has already ended
    const now = new Date();
    if (now > challenge.endDate) {
      res.status(400).json({
        success: false,
        message: 'Challenge has already ended',
      });
      return;
    }

    // Check if already ended early
    if (challenge.endedEarly) {
      res.status(400).json({
        success: false,
        message: 'Challenge has already been ended early',
      });
      return;
    }

    const originalEndDate = challenge.endDate;

    // End the challenge by setting endDate to now
    const updated = await prisma.challenge.update({
      where: { id },
      data: {
        endDate: now,
        endedEarly: true,
        isPaused: false, // Unpause if it was paused
        pausedAt: null,
      },
    });

    // Count affected participants
    const activeParticipants = challenge.userChallenges.filter(
      (uc) => uc.status === 'ACTIVE'
    ).length;

    // Log admin action
    await logAdminAction({
      action: AuditActions.CHALLENGE_ENDED,
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: challenge.id,
      details: `Ended challenge "${challenge.title}" early${reason ? `: ${reason}` : ''}`,
      type: 'DESTRUCTIVE',
      metadata: {
        challengeId: challenge.id,
        challengeTitle: challenge.title,
        originalEndDate: originalEndDate.toISOString(),
        newEndDate: now.toISOString(),
        reason: reason || null,
        activeParticipantsAffected: activeParticipants,
      },
    });

    res.json({
      success: true,
      message: 'Challenge ended successfully',
      data: {
        id: updated.id,
        title: challenge.title,
        originalEndDate,
        newEndDate: updated.endDate,
        endedEarly: updated.endedEarly,
        activeParticipantsAffected: activeParticipants,
      },
    });
  } catch (error) {
    console.error('Error ending challenge:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end challenge',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
