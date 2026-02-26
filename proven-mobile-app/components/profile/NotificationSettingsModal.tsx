import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useNotifications } from '../../context/NotificationContext';
import { useTheme } from '../../context/ThemeContext';

interface NotificationSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

interface ToggleItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  isLast?: boolean;
}

function ToggleItem({ icon, label, description, value, onValueChange, isLast }: ToggleItemProps) {
  const { colors } = useTheme();
  const styles = createToggleStyles(colors);

  return (
    <View style={[styles.item, !isLast && styles.itemBorder]}>
      <View style={styles.itemIcon}>
        <Ionicons name={icon} size={20} color={colors.textSecondary} />
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemLabel}>{label}</Text>
        <Text style={styles.itemDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.provenGreen }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

const createToggleStyles = (colors: any) => StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: `${colors.textMuted}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemLabel: {
    ...typography.body,
    color: colors.provenDark,
    fontWeight: '500',
  },
  itemDescription: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});

export function NotificationSettingsModal({
  visible,
  onClose,
}: NotificationSettingsModalProps) {
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const { preferences, updatePreferences, refreshPreferences, pushToken, loading } = useNotifications();

  const [localPrefs, setLocalPrefs] = useState({
    pushEnabled: true,
    dailyReminderEnabled: true,
    lastCallEnabled: true,
    proofReceivedEnabled: true,
    proofApprovedEnabled: true,
    proofRejectedEnabled: true,
    missedDayEnabled: true,
    challengeStartEnabled: true,
    challengeEndingEnabled: true,
    challengeCompleteEnabled: true,
    payoutEnabled: true,
  });



  useEffect(() => {
    if (visible) {
      refreshPreferences();
    }
  }, [visible, refreshPreferences]);

  useEffect(() => {
    if (preferences) {
      setLocalPrefs({
        pushEnabled: preferences.pushEnabled,
        dailyReminderEnabled: preferences.dailyReminderEnabled,
        lastCallEnabled: preferences.lastCallEnabled,
        proofReceivedEnabled: preferences.proofReceivedEnabled,
        proofApprovedEnabled: preferences.proofApprovedEnabled,
        proofRejectedEnabled: preferences.proofRejectedEnabled,
        missedDayEnabled: preferences.missedDayEnabled,
        challengeStartEnabled: preferences.challengeStartEnabled,
        challengeEndingEnabled: preferences.challengeEndingEnabled,
        challengeCompleteEnabled: preferences.challengeCompleteEnabled,
        payoutEnabled: preferences.payoutEnabled,
      });
    }
  }, [preferences]);

  const handleToggle = async (key: keyof typeof localPrefs, value: boolean) => {
    setLocalPrefs(prev => ({ ...prev, [key]: value }));
    await updatePreferences({ [key]: value });
  };



  const styles = createStyles(colors, shadows);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top || spacing.lg }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerButton} />
          <Text style={styles.headerTitle}>Notifications</Text>
          <Pressable onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={colors.provenDark} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.provenGreen} />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
      

            {/* Global Toggle */}
            <Text style={styles.sectionTitle}>Master Control</Text>
            <View style={styles.optionsList}>
              <ToggleItem
                icon="notifications"
                label="All Notifications"
                description="Turn all push notifications on or off"
                value={localPrefs.pushEnabled}
                onValueChange={(value) => handleToggle('pushEnabled', value)}
                isLast
              />
            </View>

            {/* Reminder Notifications */}
            <Text style={styles.sectionTitle}>Reminders</Text>
            <View style={[styles.optionsList, !localPrefs.pushEnabled && styles.disabled]}>
              <ToggleItem
                icon="time"
                label="Daily Reminder"
                description="Evening reminder to submit your proof"
                value={localPrefs.dailyReminderEnabled && localPrefs.pushEnabled}
                onValueChange={(value) => handleToggle('dailyReminderEnabled', value)}
              />
              <ToggleItem
                icon="alarm"
                label="Last Call"
                description="Urgent reminder 2-3 hours before cutoff"
                value={localPrefs.lastCallEnabled && localPrefs.pushEnabled}
                onValueChange={(value) => handleToggle('lastCallEnabled', value)}
              />
              <ToggleItem
                icon="calendar"
                label="Missed Day"
                description="Morning notification if you missed yesterday"
                value={localPrefs.missedDayEnabled && localPrefs.pushEnabled}
                onValueChange={(value) => handleToggle('missedDayEnabled', value)}
                isLast
              />
            </View>

            {/* Proof Notifications */}
            <Text style={styles.sectionTitle}>Proof Updates</Text>
            <View style={[styles.optionsList, !localPrefs.pushEnabled && styles.disabled]}>
              <ToggleItem
                icon="cloud-upload"
                label="Proof Received"
                description="Confirmation when your proof is submitted"
                value={localPrefs.proofReceivedEnabled && localPrefs.pushEnabled}
                onValueChange={(value) => handleToggle('proofReceivedEnabled', value)}
              />
              <ToggleItem
                icon="checkmark-circle"
                label="Proof Approved"
                description="Notification when proof is approved"
                value={localPrefs.proofApprovedEnabled && localPrefs.pushEnabled}
                onValueChange={(value) => handleToggle('proofApprovedEnabled', value)}
              />
              <ToggleItem
                icon="close-circle"
                label="Proof Rejected"
                description="Alert when proof needs resubmission"
                value={localPrefs.proofRejectedEnabled && localPrefs.pushEnabled}
                onValueChange={(value) => handleToggle('proofRejectedEnabled', value)}
                isLast
              />
            </View>

            {/* Challenge Notifications */}
            <Text style={styles.sectionTitle}>Challenge Updates</Text>
            <View style={[styles.optionsList, !localPrefs.pushEnabled && styles.disabled]}>
              <ToggleItem
                icon="play"
                label="Challenge Start"
                description="When your challenge begins"
                value={localPrefs.challengeStartEnabled && localPrefs.pushEnabled}
                onValueChange={(value) => handleToggle('challengeStartEnabled', value)}
              />
              <ToggleItem
                icon="hourglass"
                label="Challenge Ending"
                description="Heads up 2 days before end"
                value={localPrefs.challengeEndingEnabled && localPrefs.pushEnabled}
                onValueChange={(value) => handleToggle('challengeEndingEnabled', value)}
              />
              <ToggleItem
                icon="trophy"
                label="Challenge Complete"
                description="Celebration when you finish"
                value={localPrefs.challengeCompleteEnabled && localPrefs.pushEnabled}
                onValueChange={(value) => handleToggle('challengeCompleteEnabled', value)}
              />
              <ToggleItem
                icon="wallet"
                label="Payout Available"
                description="When your earnings are ready"
                value={localPrefs.payoutEnabled && localPrefs.pushEnabled}
                onValueChange={(value) => handleToggle('payoutEnabled', value)}
                isLast
              />
            </View>

            {/* Test Notification Button */}


            <View style={{ height: insets.bottom + spacing.xl }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const createStyles = (colors: any, shadows: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.lg,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.heading3,
    color: colors.provenDark,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    ...typography.bodyBold,
    color: colors.provenDark,
  },
  statusDescription: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  optionsList: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  disabled: {
    opacity: 0.5,
  },


});
