import { Expo, ExpoPushMessage, ExpoPushTicket, ExpoPushReceipt } from 'expo-server-sdk';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { NotificationType, NotificationChannel, NotificationStatus } from '@prisma/client';
import { getChallengeDayBoundary, getChallengeDayNumber, getChallengeTotalDays } from '../utils/timeUtils';

// Create a new Expo SDK client
const expo = new Expo();

type NotificationData = Record<string, string | number | boolean | null | undefined>;

type NotificationCopyTemplate = {
  title: string | ((data: NotificationData) => string);
  body: string | ((data: NotificationData) => string);
};

// Notification copy templates with variations
const NOTIFICATION_COPY: Record<NotificationType, NotificationCopyTemplate[]> = {
  DAILY_REMINDER: [
    { title: "Today's proof is due", body: (d) => `Day ${d.dayNumber} of ${d.totalDays} — upload proof for "${d.challengeTitle}" to earn today's payout.` },
    { title: "You're one proof away", body: (d) => `Submit your proof for "${d.challengeTitle}" before midnight.` },
    { title: "Don't miss today", body: (d) => `Day ${d.dayNumber}: Upload your "${d.challengeTitle}" proof to keep your streak.` },
  ],
  LAST_CALL: [
    { title: "Last chance to earn today", body: (d) => `Submit proof for "${d.challengeTitle}" now or lose today's payout.` },
    { title: "Time's almost up", body: (d) => `Only ${d.hoursLeft}h left to submit today's proof for "${d.challengeTitle}".` },
  ],
  PROOF_RECEIVED: [
    { title: "Proof submitted", body: (d) => `Your "${d.challengeTitle}" proof is being reviewed. You'll hear back soon.` },
  ],
  PROOF_APPROVED: [
    { title: "You got paid", body: (d) => `Day ${d.dayNumber} proof approved for "${d.challengeTitle}". Payout added to your balance.` },
    { title: "Proof approved", body: (d) => `Nice work! Your "${d.challengeTitle}" proof was approved.` },
  ],
  PROOF_REJECTED: [
    { title: "Proof rejected — resubmit now", body: (d) => `Your "${d.challengeTitle}" proof wasn't approved. Upload again before midnight.` },
    { title: "Resubmit needed", body: (d) => `Your proof for "${d.challengeTitle}" was rejected. ${d.reason ? `Reason: ${d.reason}` : 'Submit a new one before cutoff.'}` },
  ],
  MISSED_DAY: [
    { title: "Yesterday slipped — today counts", body: (d) => `You missed yesterday's "${d.challengeTitle}" proof. Today's still open.` },
    { title: "Start fresh today", body: (d) => `Yesterday's gone, but today's proof for "${d.challengeTitle}" is waiting.` },
  ],
  CHALLENGE_START: [
    { title: "Your challenge starts today", body: (d) => `"${d.challengeTitle}" begins now. Submit your first proof to earn Day 1 payout.` },
  ],
  CHALLENGE_ENDING: [
    {
      title: (d) => {
        const daysLeft = typeof d.daysLeft === 'number' ? d.daysLeft : Number(d.daysLeft ?? 0);
        return `${daysLeft} days left`;
      },
      body: (d) => `"${d.challengeTitle}" ends soon. Finish strong!`,
    },
    {
      title: 'Final stretch',
      body: (d) => {
        const daysLeft = typeof d.daysLeft === 'number' ? d.daysLeft : Number(d.daysLeft ?? 0);
        return `Only ${daysLeft} day${daysLeft > 1 ? 's' : ''} left in "${d.challengeTitle}". Keep going!`;
      },
    },
  ],
  CHALLENGE_COMPLETE: [
    { title: "You crushed it", body: (d) => `"${d.challengeTitle}" complete! $${d.totalEarned} earned. Check your balance.` },
    { title: "Challenge complete", body: (d) => `Congratulations! You finished "${d.challengeTitle}" and earned $${d.totalEarned}.` },
  ],
  PAYOUT_AVAILABLE: [
    { title: "Payout ready", body: (d) => `$${d.amount} is ready to withdraw from "${d.challengeTitle}".` },
  ],
  DISPUTE_RESOLVED: [
    { title: "Dispute resolved", body: (d) => `Your dispute for "${d.challengeTitle}" has been ${d.outcome}. ${d.message || ''}` },
  ],
  SYSTEM: [
    { title: 'Proven Update', body: (d) => (typeof d.message === 'string' ? d.message : 'You have a new update.') },
  ],
};

interface SendNotificationParams {
  userId: string;
  type: NotificationType;
  data?: NotificationData;
  challengeId?: string;
  submissionId?: string;
}

interface NotificationResult {
  success: boolean;
  notificationLogId?: string;
  error?: string;
}

/**
 * Get a random copy variation for a notification type
 */
function getNotificationCopy(type: NotificationType, data: NotificationData = {}): { title: string; body: string } {
  const copies = NOTIFICATION_COPY[type];
  const copy = copies[Math.floor(Math.random() * copies.length)];

  if (!copy) {
    return {
      title: 'Proven update',
      body: 'You have a new update.',
    };
  }

  const title = typeof copy.title === 'function' ? copy.title(data) : copy.title;
  const body = typeof copy.body === 'function' ? copy.body(data) : copy.body;

  return { title, body };
}

/**
 * Check if user has enabled a specific notification type
 */
async function isNotificationEnabled(userId: string, type: NotificationType): Promise<boolean> {
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  // If no preferences, use defaults (all enabled)
  if (!prefs) return true;
  if (!prefs.pushEnabled) return false;

  // Check specific type toggles
  const typeToPreference: Record<NotificationType, keyof typeof prefs> = {
    DAILY_REMINDER: 'dailyReminderEnabled',
    LAST_CALL: 'lastCallEnabled',
    PROOF_RECEIVED: 'proofReceivedEnabled',
    PROOF_APPROVED: 'proofApprovedEnabled',
    PROOF_REJECTED: 'proofRejectedEnabled',
    MISSED_DAY: 'missedDayEnabled',
    CHALLENGE_START: 'challengeStartEnabled',
    CHALLENGE_ENDING: 'challengeEndingEnabled',
    CHALLENGE_COMPLETE: 'challengeCompleteEnabled',
    PAYOUT_AVAILABLE: 'payoutEnabled',
    DISPUTE_RESOLVED: 'pushEnabled', // Use global push enabled
    SYSTEM: 'pushEnabled',
  };

  const prefKey = typeToPreference[type];
  return prefKey ? (prefs[prefKey] as boolean) : true;
}

/**
 * Get active push tokens for a user
 */
async function getUserPushTokens(userId: string): Promise<string[]> {
  const tokens = await prisma.pushToken.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: { token: true },
  });

  return tokens.map(t => t.token).filter(t => Expo.isExpoPushToken(t));
}

/**
 * Send a push notification to a user
 */
export async function sendNotification(params: SendNotificationParams): Promise<NotificationResult> {
  const { userId, type, data = {}, challengeId, submissionId } = params;

  try {
    // Check if user has this notification type enabled
    const enabled = await isNotificationEnabled(userId, type);
    if (!enabled) {
      logger.debug(`Notification ${type} disabled for user ${userId}`);
      return { success: true }; // Not an error, just skipped
    }

    // Get user's push tokens
    const pushTokens = await getUserPushTokens(userId);
    if (pushTokens.length === 0) {
      logger.debug(`No active push tokens for user ${userId}`);
      return { success: true }; // Not an error, user may not have registered
    }

    // Get notification copy
    const { title, body } = getNotificationCopy(type, data);

    // Create notification log entry
    const notificationLog = await prisma.notificationLog.create({
      data: {
        userId,
        type,
        channel: NotificationChannel.PUSH,
        title,
        body,
        data: data as Prisma.InputJsonValue,
        challengeId,
        submissionId,
        status: NotificationStatus.PENDING,
      },
    });

    // Build messages for all tokens
    const messages: ExpoPushMessage[] = pushTokens.map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: {
        type,
        challengeId,
        submissionId,
        notificationLogId: notificationLog.id,
        ...data,
      },
    }));

    // Send notifications in chunks
    const chunks = expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        logger.error('Error sending push notification chunk', error);
      }
    }

    // Check for errors in tickets
    const errors: string[] = [];
    const receiptIds: string[] = [];

    tickets.forEach((ticket, index) => {
      if (ticket.status === 'error') {
        errors.push(`Token ${pushTokens[index]}: ${ticket.message}`);

        // Handle specific error cases
        if (ticket.details?.error === 'DeviceNotRegistered') {
          // Mark token as inactive
          prisma.pushToken.updateMany({
            where: { token: pushTokens[index] },
            data: { isActive: false },
          }).catch(err => logger.error('Failed to deactivate token', err));
        }
      } else if (ticket.status === 'ok' && ticket.id) {
        receiptIds.push(ticket.id);
      }
    });

    // Update notification log with result
    const status = errors.length === tickets.length
      ? NotificationStatus.FAILED
      : NotificationStatus.SENT;

    await prisma.notificationLog.update({
      where: { id: notificationLog.id },
      data: {
        status,
        expoReceiptId: receiptIds[0] || null,
        errorMessage: errors.length > 0 ? errors.join('; ') : null,
      },
    });

    if (errors.length > 0) {
      logger.warn(`Notification ${type} partially failed for user ${userId}`, { errors });
    } else {
      logger.info(`Notification ${type} sent to user ${userId}`, { tickets: tickets.length });
    }

    return {
      success: true,
      notificationLogId: notificationLog.id,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send notification';
    logger.error(`Failed to send notification ${type} to user ${userId}`, error);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Send notification to multiple users
 */
export async function sendBulkNotifications(
  userIds: string[],
  type: NotificationType,
  data?: NotificationData,
  challengeId?: string
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const userId of userIds) {
    const result = await sendNotification({
      userId,
      type,
      data,
      challengeId,
    });

    if (result.success) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Get user's notification preferences (or create defaults)
 */
export async function getOrCreateNotificationPreferences(userId: string) {
  let prefs = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  if (!prefs) {
    prefs = await prisma.notificationPreference.create({
      data: { userId },
    });
  }

  return prefs;
}

/**
 * Update user's notification preferences
 */
export async function updateNotificationPreferences(
  userId: string,
  updates: Partial<{
    pushEnabled: boolean;
    emailEnabled: boolean;
    reminderTime: string;
    timezone: string;
    dailyReminderEnabled: boolean;
    lastCallEnabled: boolean;
    proofReceivedEnabled: boolean;
    proofApprovedEnabled: boolean;
    proofRejectedEnabled: boolean;
    missedDayEnabled: boolean;
    challengeStartEnabled: boolean;
    challengeEndingEnabled: boolean;
    challengeCompleteEnabled: boolean;
    payoutEnabled: boolean;
  }>
) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...updates },
    update: updates,
  });
}

/**
 * Register a push token for a user
 */
export async function registerPushToken(
  userId: string,
  token: string,
  deviceType: 'IOS' | 'ANDROID' | 'UNKNOWN' = 'UNKNOWN',
  deviceName?: string
) {
  if (!Expo.isExpoPushToken(token)) {
    throw new Error('Invalid Expo push token format');
  }

  return prisma.pushToken.upsert({
    where: {
      userId_token: { userId, token },
    },
    create: {
      userId,
      token,
      deviceType,
      deviceName,
      isActive: true,
    },
    update: {
      deviceType,
      deviceName,
      isActive: true,
      lastUsedAt: new Date(),
    },
  });
}

/**
 * Deactivate a push token
 */
export async function deactivatePushToken(userId: string, token: string) {
  return prisma.pushToken.updateMany({
    where: { userId, token },
    data: { isActive: false },
  });
}

/**
 * Calculate the current day number in a challenge for a user
 */
export async function getChallengeProgress(userId: string, challengeId: string): Promise<{
  dayNumber: number;
  totalDays: number;
  daysLeft: number;
  hasSubmittedToday: boolean;
}> {
  const userChallenge = await prisma.userChallenge.findFirst({
    where: { userId, challengeId },
    include: {
      challenge: { select: { startDate: true, endDate: true } },
    },
  });

  if (!userChallenge) {
    throw new Error('User not enrolled in challenge');
  }

  const now = new Date();
  const challengeDayBoundary = getChallengeDayBoundary(now);
  const challengeStartDate = new Date(userChallenge.challenge.startDate);
  const challengeEndDate = new Date(userChallenge.challenge.endDate);
  const totalDays = getChallengeTotalDays(
    challengeStartDate,
    challengeEndDate,
    challengeDayBoundary.getClientDateKey
  );
  const challengeStartKey = challengeDayBoundary.getClientDateKey(challengeStartDate);
  const challengeEndExclusiveKey = challengeDayBoundary.getClientDateKey(challengeEndDate);

  const dayNumber = challengeDayBoundary.todayStr < challengeStartKey
    ? 0
    : challengeDayBoundary.todayStr >= challengeEndExclusiveKey
      ? totalDays
      : getChallengeDayNumber(
        challengeStartDate,
        now,
        challengeDayBoundary.getClientDateKey,
        totalDays
      );

  const daysLeft = challengeDayBoundary.todayStr >= challengeEndExclusiveKey
    ? 0
    : Math.max(0, totalDays - Math.max(dayNumber, 1));

  const todaySubmission = await prisma.submission.findFirst({
    where: {
      userId,
      challengeId,
      submissionDate: {
        gte: challengeDayBoundary.todayMidnightUTC,
        lt: challengeDayBoundary.tomorrowMidnightUTC,
      },
    },
  });

  return {
    dayNumber,
    totalDays,
    daysLeft,
    hasSubmittedToday: !!todaySubmission,
  };
}

export default {
  sendNotification,
  sendBulkNotifications,
  getOrCreateNotificationPreferences,
  updateNotificationPreferences,
  registerPushToken,
  deactivatePushToken,
  getChallengeProgress,
};
