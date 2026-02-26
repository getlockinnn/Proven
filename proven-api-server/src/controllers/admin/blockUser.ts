import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { logAdminAction, AuditActions, formatWallet } from '../../services/auditService';

/**
 * Block a user from submitting proofs
 * @route POST /api/admin/users/:id/block
 * @access Private (Admin only)
 */
export const blockUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, walletAddress: true, name: true, isBlocked: true },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Toggle block status
    const newBlockStatus = !user.isBlocked;

    const updated = await prisma.user.update({
      where: { id },
      data: {
        isBlocked: newBlockStatus,
      },
    });

    // Log admin action
    await logAdminAction({
      action: newBlockStatus ? AuditActions.USER_BLOCKED : AuditActions.USER_UNBLOCKED,
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: formatWallet(user.walletAddress || user.id),
      details: newBlockStatus
        ? `Blocked user from submitting proofs`
        : `Unblocked user - can now submit proofs`,
      type: 'DESTRUCTIVE',
      metadata: {
        userId: id,
        newStatus: newBlockStatus,
      },
    });

    res.json({
      success: true,
      message: newBlockStatus ? 'User blocked' : 'User unblocked',
      data: {
        id: updated.id,
        isBlocked: updated.isBlocked,
      },
    });
  } catch (error) {
    console.error('Error blocking user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to block user',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
