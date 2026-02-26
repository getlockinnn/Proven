import prisma from '../lib/prisma';
import { ChallengeStatus } from '@prisma/client';
import { addDaysToDateKey, getChallengeDayBoundary, getChallengeTotalDays } from '../utils/timeUtils';

/**
 * Service to handle challenge completion logic
 */

interface CompletionCriteria {
  totalDays: number;
  requiredCompletionRate: number; // e.g., 0.8 for 80%
  maxConsecutiveMisses: number; // e.g., 2 = fail if 2+ days missed in a row
}

/**
 * Calculate completion status for a user challenge
 */
export async function calculateCompletionStatus(
  userChallengeId: string
): Promise<{
  isCompleted: boolean;
  isFailure: boolean;
  submittedDays: number;
  totalDays: number;
  completionRate: number;
  consecutiveMisses: number;
}> {
  const userChallenge = await prisma.userChallenge.findUnique({
    where: { id: userChallengeId },
    include: {
      challenge: true,
      submissions: {
        select: {
          status: true,
          submissionDate: true,
        },
        orderBy: {
          submissionDate: 'asc',
        },
      },
    },
  });

  if (!userChallenge) {
    throw new Error('User challenge not found');
  }

  const challengeDayBoundary = getChallengeDayBoundary();
  const toDateKey = challengeDayBoundary.getClientDateKey;
  const challengeStartDate = new Date(userChallenge.challenge.startDate);
  const challengeEndDate = new Date(userChallenge.challenge.endDate);
  const totalDays = getChallengeTotalDays(challengeStartDate, challengeEndDate, toDateKey);

  const approvedSubmissionDayKeys = new Set<string>();
  for (const submission of userChallenge.submissions) {
    if (submission.status !== 'APPROVED') continue;
    approvedSubmissionDayKeys.add(toDateKey(new Date(submission.submissionDate)));
  }

  const submittedDays = approvedSubmissionDayKeys.size;
  const completionRate = totalDays > 0 ? submittedDays / totalDays : 0;

  const consecutiveMisses = calculateConsecutiveMisses(
    approvedSubmissionDayKeys,
    challengeStartDate,
    challengeEndDate,
    toDateKey
  );

  const criteria: CompletionCriteria = {
    totalDays,
    requiredCompletionRate: 0.8,
    maxConsecutiveMisses: 2,
  };

  const isFailure = consecutiveMisses >= criteria.maxConsecutiveMisses;
  const isCompleted = !isFailure && completionRate >= criteria.requiredCompletionRate;

  return {
    isCompleted,
    isFailure,
    submittedDays,
    totalDays,
    completionRate,
    consecutiveMisses,
  };
}

/**
 * Calculate maximum consecutive misses
 */
function calculateConsecutiveMisses(
  approvedSubmissionDayKeys: Set<string>,
  challengeStartDate: Date,
  challengeEndDateExclusive: Date,
  toDateKey: (date: Date) => string
): number {
  const challengeStartKey = toDateKey(challengeStartDate);
  const challengeEndExclusiveKey = toDateKey(challengeEndDateExclusive);

  let maxConsecutiveMisses = 0;
  let currentMisses = 0;

  for (
    let dateKey = challengeStartKey;
    dateKey < challengeEndExclusiveKey;
    dateKey = addDaysToDateKey(dateKey, 1)
  ) {
    if (approvedSubmissionDayKeys.has(dateKey)) {
      currentMisses = 0;
      continue;
    }
    currentMisses += 1;
    maxConsecutiveMisses = Math.max(maxConsecutiveMisses, currentMisses);
  }

  return maxConsecutiveMisses;
}

/**
 * Update all user challenge statuses for a completed challenge
 */
export async function updateAllChallengeStatuses(challengeId: string): Promise<{
  completed: number;
  failed: number;
  total: number;
}> {
  const userChallenges = await prisma.userChallenge.findMany({
    where: {
      challengeId,
      status: ChallengeStatus.ACTIVE,
    },
  });

  let completedCount = 0;
  let failedCount = 0;

  for (const userChallenge of userChallenges) {
    try {
      const status = await calculateCompletionStatus(userChallenge.id);

      let newStatus: ChallengeStatus;
      if (status.isFailure) {
        newStatus = ChallengeStatus.FAILED;
        failedCount += 1;
      } else if (status.isCompleted) {
        newStatus = ChallengeStatus.COMPLETED;
        completedCount += 1;
      } else {
        newStatus = ChallengeStatus.FAILED;
        failedCount += 1;
      }

      await prisma.userChallenge.update({
        where: { id: userChallenge.id },
        data: {
          status: newStatus,
          progress: status.completionRate * 100,
          endDate: new Date(),
        },
      });
    } catch {
      // Continue processing other participants.
    }
  }

  return {
    completed: completedCount,
    failed: failedCount,
    total: userChallenges.length,
  };
}
