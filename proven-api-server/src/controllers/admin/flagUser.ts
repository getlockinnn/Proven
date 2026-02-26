import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { logAdminAction, AuditActions, formatWallet } from '../../services/auditService';

/**
 * Flag a user for suspicious activity
 * @route POST /api/admin/users/:id/flag
 * @access Private (Admin only)
 */
export const flagUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, walletAddress: true, name: true, isFlagged: true },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Toggle flag status
    const newFlagStatus = !user.isFlagged;

    const updated = await prisma.user.update({
      where: { id },
      data: {
        isFlagged: newFlagStatus,
        flagReason: newFlagStatus ? reason : null,
      },
    });

    // Log admin action
    await logAdminAction({
      action: newFlagStatus ? AuditActions.USER_FLAGGED : AuditActions.USER_UNFLAGGED,
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: formatWallet(user.walletAddress || user.id),
      details: newFlagStatus
        ? `Flagged user for suspicious activity: ${reason}`
        : `Removed flag from user`,
      type: newFlagStatus ? 'WARNING' : 'INFO',
      metadata: {
        userId: id,
        reason,
        newStatus: newFlagStatus,
      },
    });

    res.json({
      success: true,
      message: newFlagStatus ? 'User flagged' : 'User unflagged',
      data: {
        id: updated.id,
        isFlagged: updated.isFlagged,
        flagReason: updated.flagReason,
      },
    });
  } catch (error) {
    console.error('Error flagging user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to flag user',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
