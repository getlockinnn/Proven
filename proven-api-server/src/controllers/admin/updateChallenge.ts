import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { logAdminAction, AuditActions } from '../../services/auditService';

/**
 * Update challenge (pause, resume, end)
 * @route PATCH /api/admin/challenges/:id
 * @access Private (Admin only)
 */
export const updateChallenge = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, endDate } = req.body;

    const challenge = await prisma.challenge.findUnique({
      where: { id },
      select: { id: true, title: true, endDate: true },
    });

    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found',
      });
      return;
    }

    const updateData: any = {};
    let actionType: string = AuditActions.CHALLENGE_UPDATED;
    let details = '';

    if (status === 'PAUSED') {
      // For pause, we could add a paused field or adjust dates
      // For now, we'll log it but actual pause logic depends on requirements
      actionType = AuditActions.CHALLENGE_PAUSED;
      details = `Paused challenge "${challenge.title}"`;
    } else if (status === 'ACTIVE') {
      actionType = AuditActions.CHALLENGE_RESUMED;
      details = `Resumed challenge "${challenge.title}"`;
    } else if (status === 'ENDED') {
      updateData.endDate = new Date();
      actionType = AuditActions.CHALLENGE_ENDED;
      details = `Ended challenge "${challenge.title}" early`;
    }

    if (endDate) {
      updateData.endDate = new Date(endDate);
    }

    const updated = await prisma.challenge.update({
      where: { id },
      data: updateData,
    });

    // Log admin action
    await logAdminAction({
      action: actionType,
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: challenge.id,
      details,
      type: 'WARNING',
      metadata: { status, previousEndDate: challenge.endDate, newEndDate: updated.endDate },
    });

    res.json({
      success: true,
      message: 'Challenge updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Error updating challenge:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update challenge',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
