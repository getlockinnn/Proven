import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { addDaysToDateKey, getChallengeDayBoundary, getChallengeTotalDays } from '../../utils/timeUtils';

/**
 * Get daily progress data for a challenge (for charts)
 * @route GET /api/admin/challenges/:id/progress
 * @access Private (Admin only)
 */
export const getProgress = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const challenge = await prisma.challenge.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
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

    const submissions = await prisma.submission.findMany({
      where: { challengeId: id },
      select: {
        submissionDate: true,
        status: true,
      },
      orderBy: { submissionDate: 'asc' },
    });

    const challengeDayBoundary = getChallengeDayBoundary();
    const startDateKey = challengeDayBoundary.getClientDateKey(new Date(challenge.startDate));
    const endDateExclusiveKey = challengeDayBoundary.getClientDateKey(new Date(challenge.endDate));
    const totalDays = getChallengeTotalDays(
      new Date(challenge.startDate),
      new Date(challenge.endDate),
      challengeDayBoundary.getClientDateKey
    );

    const submissionsByDate = new Map<
      string,
      { submissions: number; approved: number; rejected: number; pending: number }
    >();

    for (const submission of submissions) {
      const dateKey = challengeDayBoundary.getClientDateKey(new Date(submission.submissionDate));
      const existing = submissionsByDate.get(dateKey) || {
        submissions: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
      };
      existing.submissions += 1;
      if (submission.status === 'APPROVED') existing.approved += 1;
      else if (submission.status === 'REJECTED') existing.rejected += 1;
      else if (submission.status === 'PENDING') existing.pending += 1;
      submissionsByDate.set(dateKey, existing);
    }

    const dailyProgress: Array<{
      day: string;
      dayNumber: number;
      submissions: number;
      approved: number;
      rejected: number;
      pending: number;
    }> = [];

    for (let i = 0; i < totalDays; i++) {
      const dayDateKey = addDaysToDateKey(startDateKey, i);

      if (dayDateKey >= endDateExclusiveKey || dayDateKey > challengeDayBoundary.todayStr) break;

      const daySubmissions = submissionsByDate.get(dayDateKey) || {
        submissions: 0,
        approved: 0,
        rejected: 0,
        pending: 0,
      };

      dailyProgress.push({
        day: `Day ${i + 1}`,
        dayNumber: i + 1,
        submissions: daySubmissions.submissions,
        approved: daySubmissions.approved,
        rejected: daySubmissions.rejected,
        pending: daySubmissions.pending,
      });
    }

    res.json({
      success: true,
      data: {
        challengeId: id,
        challengeTitle: challenge.title,
        totalDays,
        challengeTimezone: challengeDayBoundary.timeZone,
        dailyProgress,
      },
    });
  } catch (error) {
    console.error('Error fetching progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch progress data',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
