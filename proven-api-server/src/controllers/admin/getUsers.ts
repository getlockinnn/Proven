import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';

/**
 * Get all users with stats for admin panel
 * @route GET /api/admin/users
 * @access Private (Admin only)
 */
export const getUsers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const flagged = req.query.flagged === 'true';
    const blocked = req.query.blocked === 'true';
    const search = req.query.search as string;
    const skip = (page - 1) * limit;

    // Build where condition
    const whereCondition: any = {};

    if (flagged) {
      whereCondition.isFlagged = true;
    }

    if (blocked) {
      whereCondition.isBlocked = true;
    }

    if (search) {
      whereCondition.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { walletAddress: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
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
          submissions: {
            where: { status: 'REJECTED' },
            select: { id: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count({ where: whereCondition }),
    ]);

    const enrichedUsers = users.map((user) => {
      const activeChallenges = user.userChallenges.filter(
        (uc) => uc.status === 'ACTIVE'
      ).length;
      const completedChallenges = user.userChallenges.filter(
        (uc) => uc.status === 'COMPLETED'
      ).length;
      const totalEarned = user.transactions.reduce((sum, t) => sum + t.amount, 0);
      const totalStaked = user.userChallenges
        .filter((uc) => uc.status === 'ACTIVE')
        .reduce((sum, uc) => sum + uc.stakeAmount, 0);
      const missedDays = user.submissions.length; // Rejected submissions count as missed

      return {
        id: user.id,
        walletAddress: user.walletAddress || '',
        name: user.name,
        email: user.email,
        image: user.image,
        activeChallenges,
        completedChallenges,
        totalEarned,
        totalStaked,
        missedDays,
        flagged: user.isFlagged,
        flagReason: user.flagReason,
        blocked: user.isBlocked,
        createdAt: user.createdAt,
      };
    });

    // Calculate stats
    const totalFlagged = await prisma.user.count({ where: { isFlagged: true } });
    const totalBlocked = await prisma.user.count({ where: { isBlocked: true } });
    const activeToday = await prisma.submission.groupBy({
      by: ['userId'],
      where: {
        submissionDate: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: {
        users: enrichedUsers,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
          limit,
        },
        stats: {
          totalUsers: totalCount,
          activeToday: activeToday.length,
          flaggedUsers: totalFlagged,
          blockedUsers: totalBlocked,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
