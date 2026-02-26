/**
 * Notification Context for Proven Mobile App
 * Handles push notification registration and state management
 */

import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  registerForPushNotifications as registerForPushNotificationsService,
  removePushToken,
  getNotificationPreferences as getNotificationPreferencesService,
  updateNotificationPreferences as updateNotificationPreferencesService,
  getUserTimezone,
  isExpoGo,
  NotificationPreference,
  PushRegistrationStatus,
} from '../services/notificationService';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  pushToken: string | null;
  preferences: NotificationPreference | null;
  loading: boolean;
  error: string | null;
  registrationStatus: PushRegistrationStatus | null;
  isExpoGo: boolean;
  registerPushNotifications: () => Promise<string | null>;
  updatePreferences: (updates: Partial<NotificationPreference>) => Promise<boolean>;
  refreshPreferences: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<PushRegistrationStatus | null>(null);

  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const notificationListener = useRef<(() => void) | undefined>(undefined);
  const responseListener = useRef<(() => void) | undefined>(undefined);
  const registrationAttempted = useRef(false);

  // Register for push notifications
  const registerPushNotifications = useCallback(async (): Promise<string | null> => {
    if (!isAuthenticated) {
      console.log('Cannot register for push notifications: user not authenticated');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await registerForPushNotificationsService();
      setPushToken(result.token);
      setRegistrationStatus(result.status);

      // Don't treat expected environment limitations as user-facing errors.
      if (
        result.status !== 'success' &&
        result.status !== 'expo_go' &&
        result.status !== 'fcm_not_configured'
      ) {
        setError(result.message);
      }

      // Keep backend timezone aligned with the device even when push is unavailable.
      const timezone = getUserTimezone();
      if (timezone && timezone !== 'UTC') {
        await updateNotificationPreferencesService({ timezone });
      }

      return result.token;
    } catch (err: any) {
      console.error('Failed to register for push notifications:', err);
      setError(err.message || 'Failed to register for push notifications');
      setRegistrationStatus('error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Update notification preferences
  const updatePreferencesHandler = useCallback(
    async (updates: Partial<NotificationPreference>): Promise<boolean> => {
      try {
        const updated = await updateNotificationPreferencesService(updates);
        if (updated) {
          setPreferences(updated);
          return true;
        }
        return false;
      } catch (err: any) {
        console.error('Failed to update notification preferences:', err);
        setError(err.message || 'Failed to update preferences');
        return false;
      }
    },
    []
  );

  // Refresh preferences from server
  const refreshPreferences = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      const prefs = await getNotificationPreferencesService();
      setPreferences(prefs);
    } catch (err) {
      console.error('Failed to fetch notification preferences:', err);
    }
  }, [isAuthenticated]);

  // Handle notification tap - navigate to relevant screen
  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data;
      console.log('Notification tapped:', data);

      // Navigate based on notification type
      if (data?.challengeId) {
        router.push(`/challenge/${data.challengeId}`);
      } else if (data?.type === 'PROOF_REJECTED') {
        // Navigate to the challenge to resubmit proof
        if (data.challengeId) {
          router.push(`/challenge/${data.challengeId}`);
        }
      }
    },
    [router]
  );

  // Auto-register when user authenticates
  useEffect(() => {
    if (isAuthenticated && !registrationAttempted.current) {
      registrationAttempted.current = true;

      // Delay slightly to ensure auth token is persisted before hitting the API
      const timer = setTimeout(() => {
        registerPushNotifications();
        refreshPreferences();
      }, 1000);

      return () => clearTimeout(timer);
    }

    // Reset on logout
    if (!isAuthenticated) {
      registrationAttempted.current = false;
      setPushToken(null);
      setPreferences(null);
    }
  }, [isAuthenticated, registerPushNotifications, refreshPreferences]);

  // Set up notification listeners
  useEffect(() => {
    // Listener for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received in foreground:', notification);
    }).remove;

    // Listener for when user taps on notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse
    ).remove;

    // Check if app was opened from a notification
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        console.log('App opened from notification:', response);
        handleNotificationResponse(response);
      }
    });

    return () => {
      notificationListener.current?.();
      responseListener.current?.();
    };
  }, [handleNotificationResponse]);

  // Clean up push token on sign out
  useEffect(() => {
    if (!isAuthenticated && pushToken) {
      removePushToken(pushToken).catch(() => { });
    }
  }, [isAuthenticated, pushToken]);

  return (
    <NotificationContext.Provider
      value={{
        pushToken,
        preferences,
        loading,
        error,
        registrationStatus,
        isExpoGo: isExpoGo(),
        registerPushNotifications,
        updatePreferences: updatePreferencesHandler,
        refreshPreferences,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
