import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/authMiddleware';
import {
  registerPushToken,
  deactivatePushToken,
  getOrCreateNotificationPreferences,
  updateNotificationPreferences,
  sendNotification,
  getChallengeProgress,
} from '../../services/notificationService';
import { runNotificationJobsNow } from '../../services/notificationScheduler';
import prisma from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { NotificationType } from '@prisma/client';

/**
 * Register a push token for the authenticated user
 * @route POST /api/notifications/push-token
 */
export const registerToken = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { token, deviceType, deviceName } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Push token is required',
      });
      return;
    }

    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const pushToken = await registerPushToken(
      req.user.id,
      token,
      deviceType?.toUpperCase() || 'UNKNOWN',
      deviceName
    );

    // Also ensure notification preferences exist
    await getOrCreateNotificationPreferences(req.user.id);

    logger.info(`Push token registered for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Push token registered successfully',
      data: {
        id: pushToken.id,
        deviceType: pushToken.deviceType,
        isActive: pushToken.isActive,
      },
    });
  } catch (error: any) {
    logger.error('Failed to register push token', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to register push token',
    });
  }
};

/**
 * Deactivate a push token (on logout or device change)
 * @route DELETE /api/notifications/push-token
 */
export const removeToken = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Push token is required',
      });
      return;
    }

    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    await deactivatePushToken(req.user.id, token);

    logger.info(`Push token deactivated for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Push token deactivated successfully',
    });
  } catch (error: any) {
    logger.error('Failed to deactivate push token', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate push token',
    });
  }
};

/**
 * Get notification preferences for the authenticated user
 * @route GET /api/notifications/preferences
 */
export const getPreferences = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const preferences = await getOrCreateNotificationPreferences(req.user.id);

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error: any) {
    logger.error('Failed to get notification preferences', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notification preferences',
    });
  }
};

/**
 * Update notification preferences for the authenticated user
 * @route PUT /api/notifications/preferences
 */
export const updatePreferences = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const {
      pushEnabled,
      emailEnabled,
      reminderTime,
      timezone,
      dailyReminderEnabled,
      lastCallEnabled,
      proofReceivedEnabled,
      proofApprovedEnabled,
      proofRejectedEnabled,
      missedDayEnabled,
      challengeStartEnabled,
      challengeEndingEnabled,
      challengeCompleteEnabled,
      payoutEnabled,
    } = req.body;

    // Validate reminderTime format if provided
    if (reminderTime && !/^\d{2}:\d{2}$/.test(reminderTime)) {
      res.status(400).json({
        success: false,
        message: 'Invalid reminder time format. Use HH:mm (e.g., 19:00)',
      });
      return;
    }

    const preferences = await updateNotificationPreferences(req.user.id, {
      pushEnabled,
      emailEnabled,
      reminderTime,
      timezone,
      dailyReminderEnabled,
      lastCallEnabled,
      proofReceivedEnabled,
      proofApprovedEnabled,
      proofRejectedEnabled,
      missedDayEnabled,
      challengeStartEnabled,
      challengeEndingEnabled,
      challengeCompleteEnabled,
      payoutEnabled,
    });

    logger.info(`Notification preferences updated for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: preferences,
    });
  } catch (error: any) {
    logger.error('Failed to update notification preferences', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification preferences',
    });
  }
};

/**
 * Get notification history for the authenticated user
 * @route GET /api/notifications/history
 */
export const getHistory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const notifications = await prisma.notificationLog.findMany({
      where: { userId: req.user.id },
      orderBy: { sentAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        status: true,
        challengeId: true,
        sentAt: true,
        readAt: true,
      },
    });

    const total = await prisma.notificationLog.count({
      where: { userId: req.user.id },
    });

    res.json({
      success: true,
      data: {
        notifications,
        total,
        limit,
        offset,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get notification history', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notification history',
    });
  }
};

/**
 * Mark a notification as read
 * @route PUT /api/notifications/:notificationId/read
 */
export const markAsRead = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { notificationId } = req.params;

    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const notification = await prisma.notificationLog.updateMany({
      where: {
        id: notificationId,
        userId: req.user.id,
      },
      data: {
        readAt: new Date(),
        status: 'READ',
      },
    });

    if (notification.count === 0) {
      res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (error: any) {
    logger.error('Failed to mark notification as read', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
    });
  }
};

/**
 * Send a test notification to the authenticated user
 * @route POST /api/notifications/test
 */
export const sendTestNotification = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    const { type, challengeId } = req.body;

    // Get user's first active challenge for testing
    let testChallengeId = challengeId;
    let challengeTitle = 'Test Challenge';

    if (!testChallengeId) {
      const userChallenge = await prisma.userChallenge.findFirst({
        where: { userId: req.user.id, status: 'ACTIVE' },
        include: { challenge: { select: { id: true, title: true } } },
      });

      if (userChallenge) {
        testChallengeId = userChallenge.challengeId;
        challengeTitle = userChallenge.challenge.title;
      }
    } else {
      const challenge = await prisma.challenge.findUnique({
        where: { id: challengeId },
        select: { title: true },
      });
      if (challenge) challengeTitle = challenge.title;
    }

    const notificationType = (type as NotificationType) || NotificationType.DAILY_REMINDER;

    const result = await sendNotification({
      userId: req.user.id,
      type: notificationType,
      data: {
        challengeTitle,
        dayNumber: 5,
        totalDays: 21,
        daysLeft: 16,
        hoursLeft: 3,
        totalEarned: 50,
        amount: 25,
        reason: 'Test reason',
        outcome: 'approved',
        message: 'This is a test notification from Proven!',
      },
      challengeId: testChallengeId,
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Test notification sent successfully',
        data: {
          notificationLogId: result.notificationLogId,
          type: notificationType,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || 'Failed to send test notification',
      });
    }
  } catch (error: any) {
    logger.error('Failed to send test notification', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
    });
  }
};

/**
 * Manually trigger notification jobs (admin only, for testing)
 * @route POST /api/notifications/trigger-jobs
 */
export const triggerJobs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
      return;
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { isAdmin: true },
    });

    if (!user?.isAdmin) {
      res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
      return;
    }

    await runNotificationJobsNow();

    res.json({
      success: true,
      message: 'Notification jobs triggered successfully',
    });
  } catch (error: any) {
    logger.error('Failed to trigger notification jobs', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger notification jobs',
    });
  }
};
