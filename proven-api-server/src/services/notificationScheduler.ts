import cron from 'node-cron';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { sendNotification, getChallengeProgress } from './notificationService';
import { NotificationType, ChallengeStatus } from '@prisma/client';
import { DAY_MS, addDaysToDateKey, getChallengeDayBoundary } from '../utils/timeUtils';

// Track if scheduler is initialized
let isInitialized = false;

/**
 * Get current hour in a specific timezone
 */
function getCurrentHourInTimezone(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(formatter.format(now), 10);
  } catch {
    return new Date().getUTCHours(); // Fallback to UTC
  }
}

/**
 * Check if it's time to send a reminder to a user based on their preferences
 */
function isReminderTime(reminderTime: string, timezone: string): boolean {
  const [targetHour] = reminderTime.split(':').map(Number);
  const currentHour = getCurrentHourInTimezone(timezone);
  return currentHour === targetHour;
}

/**
 * Check if it's last call time (2-3 hours before midnight)
 */
function isLastCallTime(timezone: string): boolean {
  const currentHour = getCurrentHourInTimezone(timezone);
  return currentHour >= 21 && currentHour <= 22; // 9-10 PM
}

/**
 * Check if it's morning time for missed day notifications
 */
function isMorningTime(timezone: string): boolean {
  const currentHour = getCurrentHourInTimezone(timezone);
  return currentHour === 9; // 9 AM
}

function isChallengeActiveOnDateKey(
  challengeStartDate: Date,
  challengeEndDateExclusive: Date,
  targetDateKey: string,
  toDateKey: (date: Date) => string
): boolean {
  const challengeStartKey = toDateKey(challengeStartDate);
  const challengeEndExclusiveKey = toDateKey(challengeEndDateExclusive);
  return targetDateKey >= challengeStartKey && targetDateKey < challengeEndExclusiveKey;
}

/**
 * Send daily reminders to users who haven't submitted proof today
 * Runs every hour, checks each user's preferred time
 */
async function processDailyReminders() {
  logger.info('Processing daily reminders...');

  try {
    const challengeDayBoundary = getChallengeDayBoundary();
    const challengeDateKey = challengeDayBoundary.getClientDateKey;

    // Get all active user challenges
    const activeUserChallenges = await prisma.userChallenge.findMany({
      where: {
        status: ChallengeStatus.ACTIVE,
        challenge: {
          isPaused: false,
          endDate: { gte: new Date() },
        },
      },
      include: {
        user: {
          include: {
            notificationPreference: true,
            pushTokens: { where: { isActive: true } },
          },
        },
        challenge: {
          select: { id: true, title: true, startDate: true, endDate: true },
        },
      },
    });

    let sentCount = 0;

    for (const uc of activeUserChallenges) {
      const user = uc.user;
      const prefs = user.notificationPreference;

      // Skip if no push tokens or notifications disabled
      if (user.pushTokens.length === 0) continue;
      if (prefs && !prefs.pushEnabled) continue;
      if (prefs && !prefs.dailyReminderEnabled) continue;

      const reminderTime = prefs?.reminderTime || '19:00';
      const timezone = prefs?.timezone || 'UTC';

      // Check if it's the right time for this user
      if (!isReminderTime(reminderTime, timezone)) continue;

      if (!isChallengeActiveOnDateKey(
        uc.challenge.startDate,
        uc.challenge.endDate,
        challengeDayBoundary.todayStr,
        challengeDateKey
      )) continue;

      // Check if user has already submitted today
      const todaySubmission = await prisma.submission.findFirst({
        where: {
          userId: user.id,
          challengeId: uc.challengeId,
          submissionDate: {
            gte: challengeDayBoundary.todayMidnightUTC,
            lt: challengeDayBoundary.tomorrowMidnightUTC,
          },
        },
      });

      // Only send reminder if no submission today
      if (!todaySubmission) {
        try {
          const progress = await getChallengeProgress(user.id, uc.challengeId);

          await sendNotification({
            userId: user.id,
            type: NotificationType.DAILY_REMINDER,
            data: {
              challengeTitle: uc.challenge.title,
              dayNumber: progress.dayNumber,
              totalDays: progress.totalDays,
            },
            challengeId: uc.challengeId,
          });
          sentCount++;
        } catch (error) {
          logger.error(`Failed to send daily reminder to user ${user.id}`, error);
        }
      }
    }

    logger.info(`Daily reminders processed. Sent: ${sentCount}`);
  } catch (error) {
    logger.error('Error processing daily reminders', error);
  }
}

/**
 * Send last call reminders (2-3 hours before midnight)
 */
async function processLastCallReminders() {
  logger.info('Processing last call reminders...');

  try {
    const challengeDayBoundary = getChallengeDayBoundary();
    const challengeDateKey = challengeDayBoundary.getClientDateKey;

    const activeUserChallenges = await prisma.userChallenge.findMany({
      where: {
        status: ChallengeStatus.ACTIVE,
        challenge: {
          isPaused: false,
          endDate: { gte: new Date() },
        },
      },
      include: {
        user: {
          include: {
            notificationPreference: true,
            pushTokens: { where: { isActive: true } },
          },
        },
        challenge: {
          select: { id: true, title: true, startDate: true, endDate: true },
        },
      },
    });

    let sentCount = 0;

    for (const uc of activeUserChallenges) {
      const user = uc.user;
      const prefs = user.notificationPreference;

      if (user.pushTokens.length === 0) continue;
      if (prefs && !prefs.pushEnabled) continue;
      if (prefs && !prefs.lastCallEnabled) continue;

      const timezone = prefs?.timezone || 'UTC';

      // Check if it's last call time in user's timezone
      if (!isLastCallTime(timezone)) continue;

      if (!isChallengeActiveOnDateKey(
        uc.challenge.startDate,
        uc.challenge.endDate,
        challengeDayBoundary.todayStr,
        challengeDateKey
      )) continue;

      // Check if user has already submitted today
      const todaySubmission = await prisma.submission.findFirst({
        where: {
          userId: user.id,
          challengeId: uc.challengeId,
          submissionDate: {
            gte: challengeDayBoundary.todayMidnightUTC,
            lt: challengeDayBoundary.tomorrowMidnightUTC,
          },
        },
      });

      // Only send if no submission today
      if (!todaySubmission) {
        try {
          await sendNotification({
            userId: user.id,
            type: NotificationType.LAST_CALL,
            data: {
              challengeTitle: uc.challenge.title,
              hoursLeft: 24 - getCurrentHourInTimezone(timezone),
            },
            challengeId: uc.challengeId,
          });
          sentCount++;
        } catch (error) {
          logger.error(`Failed to send last call to user ${user.id}`, error);
        }
      }
    }

    logger.info(`Last call reminders processed. Sent: ${sentCount}`);
  } catch (error) {
    logger.error('Error processing last call reminders', error);
  }
}

/**
 * Send missed day notifications (morning after a missed day)
 */
async function processMissedDayNotifications() {
  logger.info('Processing missed day notifications...');

  try {
    const challengeDayBoundary = getChallengeDayBoundary();
    const challengeDateKey = challengeDayBoundary.getClientDateKey;
    const yesterdayReferenceDate = new Date(challengeDayBoundary.todayMidnightUTC.getTime() - DAY_MS);
    const yesterdayBoundary = getChallengeDayBoundary(yesterdayReferenceDate);

    const activeUserChallenges = await prisma.userChallenge.findMany({
      where: {
        status: ChallengeStatus.ACTIVE,
        challenge: {
          isPaused: false,
          endDate: { gte: new Date() },
        },
      },
      include: {
        user: {
          include: {
            notificationPreference: true,
            pushTokens: { where: { isActive: true } },
          },
        },
        challenge: {
          select: { id: true, title: true, startDate: true, endDate: true },
        },
      },
    });

    let sentCount = 0;

    for (const uc of activeUserChallenges) {
      const user = uc.user;
      const prefs = user.notificationPreference;

      if (user.pushTokens.length === 0) continue;
      if (prefs && !prefs.pushEnabled) continue;
      if (prefs && !prefs.missedDayEnabled) continue;

      const timezone = prefs?.timezone || 'UTC';

      // Only send at 9 AM
      if (!isMorningTime(timezone)) continue;

      if (!isChallengeActiveOnDateKey(
        uc.challenge.startDate,
        uc.challenge.endDate,
        yesterdayBoundary.todayStr,
        challengeDateKey
      )) continue;

      const yesterdaySubmission = await prisma.submission.findFirst({
        where: {
          userId: user.id,
          challengeId: uc.challengeId,
          submissionDate: {
            gte: yesterdayBoundary.todayMidnightUTC,
            lt: yesterdayBoundary.tomorrowMidnightUTC,
          },
          status: 'APPROVED',
        },
      });

      // Send notification if no approved submission yesterday
      if (!yesterdaySubmission) {
        try {
          await sendNotification({
            userId: user.id,
            type: NotificationType.MISSED_DAY,
            data: {
              challengeTitle: uc.challenge.title,
            },
            challengeId: uc.challengeId,
          });
          sentCount++;
        } catch (error) {
          logger.error(`Failed to send missed day notification to user ${user.id}`, error);
        }
      }
    }

    logger.info(`Missed day notifications processed. Sent: ${sentCount}`);
  } catch (error) {
    logger.error('Error processing missed day notifications', error);
  }
}

/**
 * Send challenge start notifications
 */
async function processChallengeStartNotifications() {
  logger.info('Processing challenge start notifications...');

  try {
    const challengeDayBoundary = getChallengeDayBoundary();
    const challengeDateKey = challengeDayBoundary.getClientDateKey;

    const activeChallenges = await prisma.userChallenge.findMany({
      where: {
        status: ChallengeStatus.ACTIVE,
      },
      include: {
        user: {
          include: {
            notificationPreference: true,
            pushTokens: { where: { isActive: true } },
          },
        },
        challenge: {
          select: { id: true, title: true, startDate: true },
        },
      },
    });

    let sentCount = 0;

    for (const uc of activeChallenges) {
      const user = uc.user;
      const prefs = user.notificationPreference;

      if (user.pushTokens.length === 0) continue;
      if (prefs && !prefs.pushEnabled) continue;
      if (prefs && !prefs.challengeStartEnabled) continue;

      const timezone = prefs?.timezone || 'UTC';
      const currentHour = getCurrentHourInTimezone(timezone);

      // Send at 8-9 AM in user's timezone
      if (currentHour < 8 || currentHour > 9) continue;

      const challengeStartKey = challengeDateKey(uc.challenge.startDate);
      if (challengeStartKey !== challengeDayBoundary.todayStr) continue;

      try {
        await sendNotification({
          userId: user.id,
          type: NotificationType.CHALLENGE_START,
          data: {
            challengeTitle: uc.challenge.title,
          },
          challengeId: uc.challengeId,
        });
        sentCount++;
      } catch (error) {
        logger.error(`Failed to send challenge start notification to user ${user.id}`, error);
      }
    }

    logger.info(`Challenge start notifications processed. Sent: ${sentCount}`);
  } catch (error) {
    logger.error('Error processing challenge start notifications', error);
  }
}

/**
 * Send challenge ending soon notifications (2 days before end)
 */
async function processChallengeEndingNotifications() {
  logger.info('Processing challenge ending notifications...');

  try {
    const challengeDayBoundary = getChallengeDayBoundary();
    const challengeDateKey = challengeDayBoundary.getClientDateKey;
    const targetEndDateKey = addDaysToDateKey(challengeDayBoundary.todayStr, 2);

    const activeChallenges = await prisma.userChallenge.findMany({
      where: {
        status: ChallengeStatus.ACTIVE,
      },
      include: {
        user: {
          include: {
            notificationPreference: true,
            pushTokens: { where: { isActive: true } },
          },
        },
        challenge: {
          select: { id: true, title: true, endDate: true },
        },
      },
    });

    let sentCount = 0;

    for (const uc of activeChallenges) {
      const user = uc.user;
      const prefs = user.notificationPreference;

      if (user.pushTokens.length === 0) continue;
      if (prefs && !prefs.pushEnabled) continue;
      if (prefs && !prefs.challengeEndingEnabled) continue;

      const timezone = prefs?.timezone || 'UTC';
      const currentHour = getCurrentHourInTimezone(timezone);

      // Send at 10 AM in user's timezone
      if (currentHour !== 10) continue;

      const challengeEndDateKey = challengeDateKey(uc.challenge.endDate);
      if (challengeEndDateKey !== targetEndDateKey) continue;

      try {
        await sendNotification({
          userId: user.id,
          type: NotificationType.CHALLENGE_ENDING,
          data: {
            challengeTitle: uc.challenge.title,
            daysLeft: 2,
          },
          challengeId: uc.challengeId,
        });
        sentCount++;
      } catch (error) {
        logger.error(`Failed to send challenge ending notification to user ${user.id}`, error);
      }
    }

    logger.info(`Challenge ending notifications processed. Sent: ${sentCount}`);
  } catch (error) {
    logger.error('Error processing challenge ending notifications', error);
  }
}

/**
 * Initialize the notification scheduler
 * Only runs when SCHEDULER_ENABLED=true (for horizontal scaling - only one instance should run jobs)
 */
export function initializeScheduler() {
  if (isInitialized) {
    logger.warn('Notification scheduler already initialized');
    return;
  }

  // Check if scheduler should run on this instance
  const schedulerEnabled = process.env.SCHEDULER_ENABLED === 'true';
  if (!schedulerEnabled) {
    logger.info('Notification scheduler disabled on this instance (SCHEDULER_ENABLED != true)');
    return;
  }

  logger.info('Initializing notification scheduler...');

  // Run every hour at minute 0
  // This checks each user's timezone and sends notifications at the appropriate time
  cron.schedule('0 * * * *', async () => {
    logger.info('Running hourly notification jobs...');

    // Run all notification processors
    await Promise.all([
      processDailyReminders(),
      processLastCallReminders(),
      processMissedDayNotifications(),
      processChallengeStartNotifications(),
      processChallengeEndingNotifications(),
    ]);

    logger.info('Hourly notification jobs completed');
  });

  isInitialized = true;
  logger.info('Notification scheduler initialized - running hourly checks');
}

/**
 * Manually trigger all notification jobs (for testing)
 */
export async function runNotificationJobsNow() {
  logger.info('Manually running all notification jobs...');

  await Promise.all([
    processDailyReminders(),
    processLastCallReminders(),
    processMissedDayNotifications(),
    processChallengeStartNotifications(),
    processChallengeEndingNotifications(),
  ]);

  logger.info('Manual notification jobs completed');
}

export default {
  initializeScheduler,
  runNotificationJobsNow,
};
