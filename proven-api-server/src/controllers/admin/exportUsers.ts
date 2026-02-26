import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { logAdminAction } from '../../services/auditService';

/**
 * Export users data as CSV
 * @route GET /api/admin/users/export
 * @access Private (Admin only)
 */
export const exportUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const format = (req.query.format as string) || 'csv';
    const flagged = req.query.flagged === 'true';
    const blocked = req.query.blocked === 'true';

    // Build where condition
    const whereCondition: any = {};
    if (flagged) whereCondition.isFlagged = true;
    if (blocked) whereCondition.isBlocked = true;

    // Fetch all users matching criteria
    const users = await prisma.user.findMany({
      where: whereCondition,
      include: {
        userChallenges: {
          select: {
            status: true,
            stakeAmount: true,
          },
        },
        transactions: {
          where: { transactionType: 'REWARD', status: 'COMPLETED' },
          select: { amount: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Process users data
    const exportData = users.map((user) => {
      const activeChallenges = user.userChallenges.filter(
        (uc) => uc.status === 'ACTIVE'
      ).length;
      const completedChallenges = user.userChallenges.filter(
        (uc) => uc.status === 'COMPLETED'
      ).length;
      const failedChallenges = user.userChallenges.filter(
        (uc) => uc.status === 'FAILED'
      ).length;
      const totalEarned = user.transactions.reduce((sum, t) => sum + t.amount, 0);
      const totalStaked = user.userChallenges
        .filter((uc) => uc.status === 'ACTIVE')
        .reduce((sum, uc) => sum + uc.stakeAmount, 0);

      return {
        id: user.id,
        name: user.name || '',
        email: user.email || '',
        walletAddress: user.walletAddress || '',
        activeChallenges,
        completedChallenges,
        failedChallenges,
        totalEarned: totalEarned.toFixed(2),
        totalStaked: totalStaked.toFixed(2),
        flagged: user.isFlagged ? 'Yes' : 'No',
        flagReason: user.flagReason || '',
        blocked: user.isBlocked ? 'Yes' : 'No',
        createdAt: user.createdAt.toISOString(),
      };
    });

    // Log the export action
    await logAdminAction({
      action: 'users_exported',
      actor: req.user?.email || 'unknown',
      actorId: req.user?.id,
      target: 'users',
      details: `Exported ${exportData.length} users${flagged ? ' (flagged only)' : ''}${blocked ? ' (blocked only)' : ''}`,
      type: 'INFO',
      metadata: {
        count: exportData.length,
        format,
        filters: { flagged, blocked },
      },
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=users-export.json');
      res.json({
        success: true,
        exportedAt: new Date().toISOString(),
        totalRecords: exportData.length,
        data: exportData,
      });
      return;
    }

    // Default: CSV format
    const csvHeaders = [
      'ID',
      'Name',
      'Email',
      'Wallet Address',
      'Active Challenges',
      'Completed Challenges',
      'Failed Challenges',
      'Total Earned',
      'Total Staked',
      'Flagged',
      'Flag Reason',
      'Blocked',
      'Created At',
    ];

    const csvRows = exportData.map((user) => [
      user.id,
      `"${user.name.replace(/"/g, '""')}"`,
      `"${user.email.replace(/"/g, '""')}"`,
      user.walletAddress,
      user.activeChallenges,
      user.completedChallenges,
      user.failedChallenges,
      user.totalEarned,
      user.totalStaked,
      user.flagged,
      `"${user.flagReason.replace(/"/g, '""')}"`,
      user.blocked,
      user.createdAt,
    ]);

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map((row) => row.join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=users-export.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export users',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
