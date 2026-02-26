import { Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';

type Period = 'daily' | 'weekly' | 'allTime';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatar: string;
  earned: number;
  challengesCompleted: number;
  streak: number;
  isCurrentUser?: boolean;
}

/**
 * Calculate the current streak for a user (consecutive days with approved submissions)
 */
async function calculateUserStreak(userId: string): Promise<number> {
  const submissions = await prisma.submission.findMany({
    where: {
      userId,
      status: 'APPROVED',
    },
    orderBy: {
      submissionDate: 'desc',
    },
    select: {
      submissionDate: true,
    },
  });

  if (submissions.length === 0) return 0;

  // Get unique dates (in UTC, ignoring time)
  const dates = [...new Set(
    submissions.map(s => {
      const d = new Date(s.submissionDate);
      return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    })
  )].sort().reverse();

  if (dates.length === 0) return 0;

  // Check if today or yesterday has a submission
  const today = new Date();
  const todayStr = `${today.getUTCFullYear()}-${today.getUTCMonth()}-${today.getUTCDate()}`;
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = `${yesterday.getUTCFullYear()}-${yesterday.getUTCMonth()}-${yesterday.getUTCDate()}`;

  if (dates[0] !== todayStr && dates[0] !== yesterdayStr) {
    return 0; // Streak broken
  }

  // Count consecutive days
  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const prevParts = dates[i - 1].split('-').map(Number);
    const currParts = dates[i].split('-').map(Number);
    const prevDate = new Date(Date.UTC(prevParts[0], prevParts[1], prevParts[2]));
    const currDate = new Date(Date.UTC(currParts[0], currParts[1], currParts[2]));

    const diffDays = (prevDate.getTime() - currDate.getTime()) / (24 * 60 * 60 * 1000);

    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Get leaderboard data
 * @route GET /api/leaderboard
 * @query period - 'daily' | 'weekly' | 'allTime' (default: 'weekly')
 * @access Public (but marks current user if authenticated)
 */
export const getLeaderboard = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const period = (req.query.period as Period) || 'weekly';
    const currentUserId = req.user?.id;

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'daily':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'allTime':
      default:
        startDate = new Date(0); // Beginning of time
        break;
    }

    // Get users with their stats
    const users = await prisma.user.findMany({
      where: {
        isBlocked: false,
      },
      select: {
        id: true,
        name: true,
        preferredName: true,
        image: true,
        userChallenges: {
          where: {
            status: 'COMPLETED',
          },
          select: {
            id: true,
          },
        },
        transactions: {
          where: {
            transactionType: 'REWARD',
            status: 'COMPLETED',
            createdAt: {
              gte: startDate,
            },
          },
          select: {
            amount: true,
          },
        },
      },
    });

    // Calculate earned and build leaderboard entries
    const leaderboardData: (LeaderboardEntry & { sortValue: number })[] = [];

    for (const user of users) {
      const earned = user.transactions.reduce((sum, t) => sum + t.amount, 0);
      const challengesCompleted = user.userChallenges.length;

      // Only include users with some activity
      if (earned > 0 || challengesCompleted > 0) {
        const streak = await calculateUserStreak(user.id);

        leaderboardData.push({
          rank: 0, // Will be set after sorting
          userId: user.id,
          name: user.preferredName || user.name || 'Anonymous',
          avatar: user.image || `${process.env.DEFAULT_AVATAR_BASE_URL}${user.id}`,
          earned,
          challengesCompleted,
          streak,
          isCurrentUser: currentUserId === user.id,
          sortValue: earned, // Primary sort by earnings
        });
      }
    }

    // Sort by earned (descending), then by challenges completed
    leaderboardData.sort((a, b) => {
      if (b.earned !== a.earned) return b.earned - a.earned;
      return b.challengesCompleted - a.challengesCompleted;
    });

    // Assign ranks
    const leaderboard: LeaderboardEntry[] = leaderboardData.map((entry, index) => {
      const { sortValue, ...rest } = entry;
      return {
        ...rest,
        rank: index + 1,
      };
    });

    // Get current user's rank if not in top results
    let currentUserRank: LeaderboardEntry | null = null;
    if (currentUserId) {
      const userEntry = leaderboard.find(e => e.isCurrentUser);
      if (userEntry) {
        currentUserRank = userEntry;
      }
    }

    res.json({
      success: true,
      data: {
        period,
        leaderboard: leaderboard.slice(0, 50), // Top 50
        currentUserRank,
        totalParticipants: leaderboard.length,
      },
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leaderboard',
    });
  }
};

/**
 * Get all leaderboard periods at once
 * @route GET /api/leaderboard/all
 * @access Public
 */
export const getAllLeaderboards = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserId = req.user?.id;
    const now = new Date();

    // Date ranges
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get all users with their stats
    const users = await prisma.user.findMany({
      where: {
        isBlocked: false,
      },
      select: {
        id: true,
        name: true,
        preferredName: true,
        image: true,
        userChallenges: {
          where: {
            status: 'COMPLETED',
          },
          select: {
            id: true,
          },
        },
        transactions: {
          where: {
            transactionType: 'REWARD',
            status: 'COMPLETED',
          },
          select: {
            amount: true,
            createdAt: true,
          },
        },
      },
    });

    // Build leaderboard for each period
    const buildLeaderboard = async (
      filterDate: Date | null
    ): Promise<LeaderboardEntry[]> => {
      const entries: (LeaderboardEntry & { sortValue: number })[] = [];

      for (const user of users) {
        const filteredTransactions = filterDate
          ? user.transactions.filter(t => new Date(t.createdAt) >= filterDate)
          : user.transactions;

        const earned = filteredTransactions.reduce((sum, t) => sum + t.amount, 0);
        const challengesCompleted = user.userChallenges.length;

        if (earned > 0 || challengesCompleted > 0) {
          const streak = await calculateUserStreak(user.id);

          entries.push({
            rank: 0,
            userId: user.id,
            name: user.preferredName || user.name || 'Anonymous',
            avatar: user.image || `${process.env.DEFAULT_AVATAR_BASE_URL}${user.id}`,
            earned,
            challengesCompleted,
            streak,
            isCurrentUser: currentUserId === user.id,
            sortValue: earned,
          });
        }
      }

      entries.sort((a, b) => {
        if (b.earned !== a.earned) return b.earned - a.earned;
        return b.challengesCompleted - a.challengesCompleted;
      });

      return entries.slice(0, 50).map((entry, index) => {
        const { sortValue, ...rest } = entry;
        return { ...rest, rank: index + 1 };
      });
    };

    const [daily, weekly, allTime] = await Promise.all([
      buildLeaderboard(todayStart),
      buildLeaderboard(weekStart),
      buildLeaderboard(null),
    ]);

    res.json({
      success: true,
      data: {
        daily,
        weekly,
        allTime,
      },
    });
  } catch (error) {
    console.error('Error fetching all leaderboards:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leaderboards',
    });
  }
};

/**
 * Get current user's rank
 * @route GET /api/leaderboard/me
 * @access Private
 */
export const getCurrentUserRank = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        preferredName: true,
        image: true,
        userChallenges: {
          where: {
            status: 'COMPLETED',
          },
          select: {
            id: true,
          },
        },
        transactions: {
          where: {
            transactionType: 'REWARD',
            status: 'COMPLETED',
          },
          select: {
            amount: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    const earned = user.transactions.reduce((sum, t) => sum + t.amount, 0);
    const challengesCompleted = user.userChallenges.length;
    const streak = await calculateUserStreak(userId);

    // Calculate rank by counting users with more earnings
    const usersAbove = await prisma.user.count({
      where: {
        isBlocked: false,
        transactions: {
          some: {
            transactionType: 'REWARD',
            status: 'COMPLETED',
          },
        },
      },
    });

    // Simplified rank calculation
    const rank = usersAbove > 0 ? Math.max(1, usersAbove) : 1;

    res.json({
      success: true,
      data: {
        rank,
        userId: user.id,
        name: user.preferredName || user.name || 'Anonymous',
        avatar: user.image || `${process.env.DEFAULT_AVATAR_BASE_URL}${user.id}`,
        earned,
        challengesCompleted,
        streak,
        isCurrentUser: true,
      },
    });
  } catch (error) {
    console.error('Error fetching user rank:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user rank',
    });
  }
};
