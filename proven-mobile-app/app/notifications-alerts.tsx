import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { EmptyState } from '../components/ui';
import { borderRadius, spacing, typography } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { getNotificationHistory, NotificationLogEntry } from '../services/notificationService';

interface DisplayNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'reminder' | 'success' | 'alert' | 'info';
  read: boolean;
}

function mapNotificationType(backendType: string): DisplayNotification['type'] {
  switch (backendType?.toUpperCase()) {
    case 'DAILY_REMINDER':
    case 'LAST_CALL':
    case 'REMINDER':
      return 'reminder';
    case 'PROOF_APPROVED':
    case 'CHALLENGE_COMPLETE':
    case 'PAYOUT':
    case 'SUCCESS':
      return 'success';
    case 'PROOF_REJECTED':
    case 'MISSED_DAY':
    case 'ALERT':
      return 'alert';
    default:
      return 'info';
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function transformNotification(entry: NotificationLogEntry): DisplayNotification {
  return {
    id: entry.id,
    title: entry.title,
    message: entry.body,
    time: formatRelativeTime(entry.sentAt),
    type: mapNotificationType(entry.type),
    read: !!entry.readAt,
  };
}

export default function NotificationAlertsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, shadows } = useTheme();

  const [notifications, setNotifications] = useState<DisplayNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const result = await getNotificationHistory(50, 0);
      if (result?.notifications) {
        setNotifications(result.notifications.map(transformNotification));
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (type: DisplayNotification['type']) => {
    switch (type) {
      case 'reminder': return 'time';
      case 'success': return 'checkmark-circle';
      case 'alert': return 'alert-circle';
      case 'info': return 'information-circle';
      default: return 'notifications';
    }
  };

  const getIconColor = (type: DisplayNotification['type']) => {
    switch (type) {
      case 'reminder': return '#f59e0b';
      case 'success': return colors.provenGreen;
      case 'alert': return '#ef4444';
      case 'info': return '#3b82f6';
      default: return colors.textSecondary;
    }
  };

  const renderItem = ({ item }: { item: DisplayNotification }) => (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.cardBackground },
        shadows.sm,
        !item.read && { backgroundColor: `${colors.provenGreen}08`, borderColor: `${colors.provenGreen}30`, borderWidth: 1 },
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: `${getIconColor(item.type)}20` }]}>
        <Ionicons name={getIcon(item.type)} size={24} color={getIconColor(item.type)} />
      </View>
      <View style={styles.content}>
        <View style={styles.itemHeader}>
          <Text style={[styles.title, { color: colors.provenDark }]}>{item.title}</Text>
          <Text style={[styles.time, { color: colors.textMuted }]}>{item.time}</Text>
        </View>
        <Text style={[styles.message, { color: colors.textSecondary }]}>{item.message}</Text>
      </View>
      {!item.read && <View style={[styles.unreadDot, { backgroundColor: colors.provenGreen }]} />}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.provenGreen} />
        </View>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="No notifications yet"
          subtitle="System reminders and updates will appear here"
        />
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={() => void loadAlerts()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.heading3,
    textAlign: 'center',
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    ...typography.bodyBold,
    flex: 1,
    marginRight: spacing.sm,
  },
  time: {
    ...typography.caption,
  },
  message: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
});
