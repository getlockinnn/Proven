import cron from 'node-cron';
import { ChallengeStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { createServiceLogger } from '../lib/logger';
import { createPayoutJob } from './payoutQueue';
import {
  getChallengeDayBoundary,
  getChallengeTotalDays,
  addDaysToDateKey,
  getDateKeyInTimeZone,
} from '../utils/timeUtils';

const logger = createServiceLogger('daily-settlement');

/**
 * Settle a single day for a challenge.
 * Idempotent: if settlement already exists, returns it.
 */
export async function settleDayForChallenge(
  challengeId: string,
  dayDate: string
) {
  // Idempotency: check if settlement already exists
  const existing = await prisma.dailySettlement.findUnique({
    where: { challengeId_dayDate: { challengeId, dayDate } },
  });
  if (existing) {
    logger.info('Settlement already exists, skipping', { challengeId, dayDate });
    return existing;
  }

  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: {
      userChallenges: {
        where: {
          // Include ACTIVE users and also FAILED users (their daily share goes to pool)
          status: { in: [ChallengeStatus.ACTIVE, ChallengeStatus.FAILED] },
        },
        select: {
          id: true,
          userId: true,
          status: true,
          stakeAmount: true,
          walletAddress: true,
        },
      },
    },
  });

  if (!challenge) {
    throw new Error(`Challenge ${challengeId} not found`);
  }

  const boundary = getChallengeDayBoundary();
  const toDateKey = boundary.getClientDateKey;
  const challengeStart = new Date(challenge.startDate);
  const challengeEnd = new Date(challenge.endDate);
  const totalDays = getChallengeTotalDays(challengeStart, challengeEnd, toDateKey);

  // Get approved submissions for this specific day
  // We need to find submissions whose submissionDate maps to this dayDate
  const allSubmissions = await prisma.submission.findMany({
    where: {
      challengeId,
      status: 'APPROVED',
    },
    select: {
      userId: true,
      submissionDate: true,
    },
  });

  const submissionsForDay = allSubmissions.filter(
    (s) => toDateKey(new Date(s.submissionDate)) === dayDate
  );
  const showedUpUserIds = new Set(submissionsForDay.map((s) => s.userId));

  // Active participants who should have shown up
  const activeParticipants = challenge.userChallenges.filter(
    (uc) => uc.status === ChallengeStatus.ACTIVE
  );
  // Failed participants — their daily share goes to pool
  const failedParticipants = challenge.userChallenges.filter(
    (uc) => uc.status === ChallengeStatus.FAILED
  );

  const showedUp = activeParticipants.filter((uc) => showedUpUserIds.has(uc.userId));
  const missed = activeParticipants.filter((uc) => !showedUpUserIds.has(uc.userId));

  // Use the first participant's stake as the reference (all should be same)
  const referenceStake = challenge.userChallenges[0]?.stakeAmount ?? challenge.stakeAmount;
  const baseDailyRate = Math.floor((referenceStake * 1_000_000) / totalDays);

  // Pool from no-shows and failed users
  const missedCount = missed.length + failedParticipants.length;
  const missedPool = missedCount * baseDailyRate;
  const bonusPerPerson = showedUp.length > 0 ? Math.floor(missedPool / showedUp.length) : 0;

  // Create bonus payout jobs for each showed-up user
  let totalDistributed = 0;
  if (bonusPerPerson > 0) {
    for (const uc of showedUp) {
      await createPayoutJob({
        userId: uc.userId,
        challengeId,
        amount: bonusPerPerson,
        type: 'DAILY_BONUS',
        dayDate,
        walletAddress: uc.walletAddress || '',
      });
      totalDistributed += bonusPerPerson;
    }
  }

  // Create DailySettlement record
  const settlement = await prisma.dailySettlement.create({
    data: {
      challengeId,
      dayDate,
      totalActive: activeParticipants.length,
      showedUp: showedUp.length,
      missed: missed.length + failedParticipants.length,
      baseDailyRate,
      bonusPerPerson,
      totalDistributed,
    },
  });

  logger.info('Day settled', {
    challengeId,
    dayDate,
    active: activeParticipants.length,
    showedUp: showedUp.length,
    missed: missedCount,
    bonusPerPerson: bonusPerPerson / 1_000_000,
    totalDistributed: totalDistributed / 1_000_000,
  });

  return settlement;
}

/**
 * Run daily settlement for all active challenges.
 * Settles yesterday's date for each challenge that was active.
 */
export async function runDailySettlement(): Promise<void> {
  const boundary = getChallengeDayBoundary();
  const toDateKey = boundary.getClientDateKey;
  const yesterdayDateKey = addDaysToDateKey(boundary.todayStr, -1);

  logger.info('Running daily settlement', { yesterday: yesterdayDateKey, today: boundary.todayStr });

  // Find all active challenges (not completed, not paused, started before yesterday, ends after yesterday)
  const activeChallenges = await prisma.challenge.findMany({
    where: {
      isCompleted: false,
      isPaused: false,
      payoutsFinalized: false,
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
    },
  });

  for (const challenge of activeChallenges) {
    const startKey = toDateKey(new Date(challenge.startDate));
    const endKey = toDateKey(new Date(challenge.endDate));

    // Only settle if yesterday falls within the challenge range
    if (yesterdayDateKey >= startKey && yesterdayDateKey < endKey) {
      try {
        await settleDayForChallenge(challenge.id, yesterdayDateKey);
      } catch (err) {
        logger.error('Settlement failed for challenge', {
          challengeId: challenge.id,
          dayDate: yesterdayDateKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  logger.info('Daily settlement complete');
}

let cronTask: ReturnType<typeof cron.schedule> | null = null;

export function startDailySettlementCron(): void {
  if (process.env.PAYOUT_WORKER_ENABLED !== 'true') {
    logger.info('Daily settlement cron disabled (set PAYOUT_WORKER_ENABLED=true to enable)');
    return;
  }

  // Run hourly at minute 5 (e.g., 00:05, 01:05, ...)
  cronTask = cron.schedule('5 * * * *', async () => {
    try {
      await runDailySettlement();
    } catch (err) {
      logger.error('Daily settlement cron error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  logger.info('Daily settlement cron started (hourly at :05)');
}

export function stopDailySettlementCron(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    logger.info('Daily settlement cron stopped');
  }
}
