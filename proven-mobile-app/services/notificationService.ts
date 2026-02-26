/**
 * Notification Service - Push notifications and preferences management
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { get, post, put, del } from '../lib/api';
import { getAuthToken } from '../lib/api/auth';
import Constants from 'expo-constants';

// Types for push registration result
export type PushRegistrationStatus =
  | 'success'
  | 'expo_go'
  | 'fcm_not_configured'
  | 'permission_denied'
  | 'not_physical_device'
  | 'no_project_id'
  | 'error';

export interface PushRegistrationResult {
  token: string | null;
  status: PushRegistrationStatus;
  message: string;
}

/**
 * Check if running in Expo Go
 */
export function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

// Configure how notifications should be displayed when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Types
export interface NotificationPreference {
  id: string;
  userId: string;
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
}

export interface NotificationLogEntry {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  challengeId?: string;
  sentAt: string;
  readAt?: string;
}

// API Endpoints
const NOTIFICATION_ENDPOINTS = {
  PUSH_TOKEN: '/notifications/push-token',
  PREFERENCES: '/notifications/preferences',
  HISTORY: '/notifications/history',
  MARK_READ: (id: string) => `/notifications/${id}/read`,
};

/**
 * Request notification permissions and get push token
 */
export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  if (isExpoGo()) {
    console.log('Push notifications are not available in Expo Go (SDK 53+)');
    return {
      token: null,
      status: 'expo_go',
      message: 'Push notifications are not available in Expo Go. Build a development build to enable them.',
    };
  }

  if (!Device.isDevice) {
    return {
      token: null,
      status: 'not_physical_device',
      message: 'Push notifications require a physical device.',
    };
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return {
      token: null,
      status: 'permission_denied',
      message: 'Push notification permission was not granted. Enable notifications in Settings.',
    };
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId || projectId === 'your-eas-project-id') {
      console.warn('Push notifications require EAS project configuration.');
      return {
        token: null,
        status: 'no_project_id',
        message: 'Push notifications require EAS project configuration. Run: npx eas init',
      };
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    console.log('Expo Push Token:', token);

    await registerPushToken(token);

    return {
      token,
      status: 'success',
      message: 'Push notifications enabled successfully.',
    };
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : '';
    const isMissingFcmConfig =
      message.includes('Default FirebaseApp is not initialized') ||
      message.includes('push-notifications/fcm-credentials');

    if (isMissingFcmConfig) {
      console.warn('Push notifications skipped: Android FCM is not configured yet.');
      return {
        token: null,
        status: 'fcm_not_configured',
        message: 'Push notifications are disabled until Android FCM credentials are configured.',
      };
    }

    console.error('Error getting push token:', error);

    if (message.includes('projectId') || message.includes('Expo Go')) {
      return {
        token: null,
        status: 'expo_go',
        message: 'Push notifications are not available in Expo Go. Build a development build to enable them.',
      };
    }

    return {
      token: null,
      status: 'error',
      message: message || 'Failed to register for push notifications.',
    };
  }
}

/**
 * Register push token with backend
 */
export async function registerPushToken(token: string): Promise<boolean> {
  try {
    const deviceType = Platform.OS === 'ios' ? 'IOS' : Platform.OS === 'android' ? 'ANDROID' : 'UNKNOWN';
    const deviceName = Device.deviceName || undefined;

    await post(NOTIFICATION_ENDPOINTS.PUSH_TOKEN, {
      token,
      deviceType,
      deviceName,
    });

    console.log('Push token registered with backend');
    return true;
  } catch (error) {
    console.error('Error registering push token:', error);
    return false;
  }
}

/**
 * Remove push token (call on logout)
 */
export async function removePushToken(token: string): Promise<boolean> {
  try {
    // Logout flow clears auth first in current architecture, so skip server call when unauthenticated.
    const authToken = await getAuthToken();
    if (!authToken) {
      return true;
    }

    await del(NOTIFICATION_ENDPOINTS.PUSH_TOKEN, { token });
    return true;
  } catch (error) {
    console.error('Error removing push token:', error);
    return false;
  }
}

/**
 * Get notification preferences
 */
export async function getNotificationPreferences(): Promise<NotificationPreference | null> {
  try {
    const response = await get<{ success: boolean; data: NotificationPreference }>(
      NOTIFICATION_ENDPOINTS.PREFERENCES
    );
    return response?.data || null;
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return null;
  }
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(
  updates: Partial<Omit<NotificationPreference, 'id' | 'userId'>>
): Promise<NotificationPreference | null> {
  try {
    const response = await put<{ success: boolean; data: NotificationPreference }>(
      NOTIFICATION_ENDPOINTS.PREFERENCES,
      updates
    );
    return response?.data || null;
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return null;
  }
}

/**
 * Get notification history
 */
export async function getNotificationHistory(
  limit: number = 20,
  offset: number = 0
): Promise<{ notifications: NotificationLogEntry[]; total: number } | null> {
  try {
    const response = await get<{
      success: boolean;
      data: { notifications: NotificationLogEntry[]; total: number };
    }>(`${NOTIFICATION_ENDPOINTS.HISTORY}?limit=${limit}&offset=${offset}`);
    return response?.data || null;
  } catch (error) {
    console.error('Error fetching notification history:', error);
    return null;
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<boolean> {
  try {
    await put(NOTIFICATION_ENDPOINTS.MARK_READ(notificationId), {});
    return true;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return false;
  }
}

/**
 * Get user's timezone (for setting preferences)
 */
export function getUserTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && typeof tz === 'string') return tz;
  } catch {
    // fall back to UTC
  }
  return 'UTC';
}

export default {
  registerForPushNotifications,
  registerPushToken,
  removePushToken,
  getNotificationPreferences,
  updateNotificationPreferences,
  getNotificationHistory,
  markNotificationAsRead,
  getUserTimezone,
};
