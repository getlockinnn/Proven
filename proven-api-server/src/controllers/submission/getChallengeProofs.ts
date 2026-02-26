import { Response } from 'express';
import { Prisma, TransactionType, TransactionStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import prisma from '../../lib/prisma';
import { supabase, SUPABASE_URL_VALUE } from '../../lib/supabase';
import { cache } from '../../lib/cache';
import { getChallengeDayBoundary, getChallengeTotalDays, addDaysToDateKey } from '../../utils/timeUtils';

type DailyPayoutMetadata = {
  type: 'daily_payout';
  dayNumber: number;
};

const getDailyPayoutMetadata = (value: Prisma.JsonValue | null): DailyPayoutMetadata | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const metadata = value as Prisma.JsonObject;
  const typeValue = metadata.type;
  const dayNumberValue = metadata.dayNumber;

  if (typeValue !== 'daily_payout') return null;
  if (typeof dayNumberValue !== 'number' || !Number.isInteger(dayNumberValue) || dayNumberValue <= 0) return null;

  return {
    type: 'daily_payout',
    dayNumber: dayNumberValue,
  };
};

type CalendarStatus = 'not_submitted' | 'submitted' | 'approved' | 'rejected' | 'locked';

type CalendarDayItem = {
  dayNumber: number;
  date: string;
  dayOfWeek: number;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  status: CalendarStatus;
  submission: {
    id: string;
    imageUrl: string;
    description: string | null;
    submissionDate: Date;
    reviewComments: string | null;
    reviewedAt: Date | null;
  } | null;
  payout: {
    amount: number;
    transactionSignature: string;
  } | null;
  canSubmit: boolean;
};

/**
 * Get daily proof calendar data for a specific challenge
 * @route GET /api/submissions/challenge/:challengeId/calendar
 * @access Private (requires authentication)
 */
export const getChallengeProofs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const { challengeId } = req.params;
    const userId = req.user.id;

    if (!challengeId) {
      res.status(400).json({
        success: false,
        message: 'Challenge ID is required'
      });
      return;
    }

    // First, check if user has joined this challenge
    const userChallenge = await prisma.userChallenge.findFirst({
      where: {
        userId: userId,
        challengeId: challengeId
      }
    });

    if (!userChallenge) {
      res.status(403).json({
        success: false,
        message: 'You have not joined this challenge'
      });
      return;
    }

    // Get challenge details to determine date range
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      select: {
        id: true,
        title: true,
        startDate: true,
        endDate: true
      }
    });

    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
      return;
    }

    // Get all user's submissions for this challenge
    const submissions = await prisma.submission.findMany({
      where: {
        userId: userId,
        challengeId: challengeId
      },
      select: {
        id: true,
        imageUrl: true,
        description: true,
        submissionDate: true,
        status: true,
        reviewComments: true,
        reviewedAt: true
      },
      orderBy: {
        submissionDate: 'asc'
      }
    });

    // Fetch daily payout transactions for this user/challenge to include tx signatures
    const dailyPayoutTxns = await prisma.transaction.findMany({
      where: {
        userId,
        challengeId,
        transactionType: TransactionType.REWARD,
        status: TransactionStatus.COMPLETED,
      },
      select: { transactionSignature: true, metadata: true, amount: true },
    });

    // Map dayNumber → tx signature for daily payouts
    const payoutByDay: Record<number, { signature: string; amount: number }> = {};
    for (const tx of dailyPayoutTxns) {
      const metadata = getDailyPayoutMetadata(tx.metadata);
      if (metadata && tx.transactionSignature) {
        payoutByDay[metadata.dayNumber] = {
          signature: tx.transactionSignature,
          amount: tx.amount,
        };
      }
    }

    // Ensure image URLs are accessible. If we stored a storage path, create a signed URL
    const submissionsWithUrls = await Promise.all(
      submissions.map(async (s) => {
        const key = `signed:${s.imageUrl}`;
        const cachedUrl = cache.get<string>(key);
        if (cachedUrl) {
          return { ...s, imageUrl: cachedUrl };
        }

        let url = s.imageUrl;
        if (typeof url === 'string' && !/^https?:\/\//i.test(url)) {
          if (supabase) {
            try {
              const { data: signed } = await supabase.storage
                .from('proof-submission')
                .createSignedUrl(url, 60 * 60);
              url = signed?.signedUrl || url;
            } catch (_) {
              // ignore; fall back to stored value
            }
          }
          if (!/^https?:\/\//i.test(url)) {
            // As a final fallback, construct public URL
            url = `${SUPABASE_URL_VALUE}/storage/v1/object/public/proof-submission/${url}`;
          }

          // Cache signed/public URL for 55 minutes to avoid per-item signing on every request
          cache.set(key, url, 55 * 60 * 1000);
        }

        return { ...s, imageUrl: url };
      })
    );

    const {
      todayStr,
      getClientDateKey,
      timeZone
    } = getChallengeDayBoundary();

    // Map submissions by date in canonical challenge timezone (IST).
    const submissionsByDate = new Map<string, (typeof submissionsWithUrls)[number]>();
    submissionsWithUrls.forEach(submission => {
      const dateStr = getClientDateKey(new Date(submission.submissionDate));
      submissionsByDate.set(dateStr, submission);
    });

    // Calendar bounds in canonical challenge timezone (YYYY-MM-DD strings compare lexicographically).
    const chStartStr = getClientDateKey(new Date(challenge.startDate));
    const chEndExclusiveStr = getClientDateKey(new Date(challenge.endDate));
    const durationDays = getChallengeTotalDays(
      new Date(challenge.startDate),
      new Date(challenge.endDate),
      getClientDateKey
    );

    const ucStartStr = getClientDateKey(new Date(userChallenge.startDate));
    const ucEndExclusiveStr = userChallenge.endDate
      ? getClientDateKey(new Date(userChallenge.endDate))
      : addDaysToDateKey(ucStartStr, durationDays);

    // Clamp calendar window to the official challenge bounds.
    const calStartStr = chStartStr > ucStartStr ? chStartStr : ucStartStr;
    const calEndExclusiveStr = chEndExclusiveStr < ucEndExclusiveStr ? chEndExclusiveStr : ucEndExclusiveStr;

    if (calStartStr >= calEndExclusiveStr) {
      res.status(400).json({
        success: false,
        message: 'Challenge participation window is invalid for this user.'
      });
      return;
    }

    const calendar: CalendarDayItem[] = [];

    let dayNumber = 0;
    for (let dateStr = calStartStr; dateStr < calEndExclusiveStr; dateStr = addDaysToDateKey(dateStr, 1)) {
      dayNumber++;
      const d = new Date(dateStr + 'T12:00:00Z');
      const dayOfWeek = d.getUTCDay();
      const isToday = dateStr === todayStr;
      const isPast = dateStr < todayStr;
      const isFuture = dateStr > todayStr;

      const submission = submissionsByDate.get(dateStr);

      let status: 'not_submitted' | 'submitted' | 'approved' | 'rejected' | 'locked' = 'not_submitted';
      if (isFuture) {
        status = 'locked';
      } else if (submission) {
        const submissionStatus = submission.status.toLowerCase();
        if (submissionStatus === 'pending') {
          status = 'submitted';
        } else {
          status = submissionStatus as 'submitted' | 'approved' | 'rejected';
        }
      }

      const payout = payoutByDay[dayNumber];

      calendar.push({
        dayNumber,
        date: dateStr,
        dayOfWeek,
        isToday,
        isPast,
        isFuture,
        status,
        submission: submission ? {
          id: submission.id,
          imageUrl: submission.imageUrl,
          description: submission.description,
          submissionDate: submission.submissionDate,
          reviewComments: submission.reviewComments,
          reviewedAt: submission.reviewedAt
        } : null,
        payout: payout ? {
          amount: payout.amount,
          transactionSignature: payout.signature,
        } : null,
        canSubmit: isToday && !submission && dateStr >= chStartStr && dateStr < chEndExclusiveStr
      });
    }

    // Calculate statistics
    const totalDays = calendar.length;
    const submittedDays = calendar.filter(day => day.submission).length;
    const approvedDays = calendar.filter(day => day.status === 'approved').length;
    const rejectedDays = calendar.filter(day => day.status === 'rejected').length;
    const missedDays = calendar.filter(day => day.status === 'not_submitted' && day.isPast).length;

    res.json({
      success: true,
      data: {
        challenge: {
          id: challenge.id,
          title: challenge.title,
          startDate: chStartStr,
          endDate: addDaysToDateKey(chEndExclusiveStr, -1),
          duration: durationDays + ' days',
          challengeTimezone: timeZone,
        },
        userChallenge: {
          id: userChallenge.id,
          progress: userChallenge.progress,
          stakeAmount: userChallenge.stakeAmount
        },
        calendar,
        statistics: {
          totalDays,
          submittedDays,
          approvedDays,
          rejectedDays,
          missedDays,
          completionRate: totalDays > 0 ? Math.round((approvedDays / totalDays) * 100) : 0
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch challenge calendar',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
}; 
