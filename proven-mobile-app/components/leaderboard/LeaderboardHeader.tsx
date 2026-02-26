import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

export type LeaderboardPeriod = 'daily' | 'weekly';

interface LeaderboardHeaderProps {
  selectedPeriod: LeaderboardPeriod;
  onPeriodChange: (period: LeaderboardPeriod) => void;
}

const periods: { key: LeaderboardPeriod; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
];

export function LeaderboardHeader({ selectedPeriod, onPeriodChange }: LeaderboardHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const [timeLeft, setTimeLeft] = React.useState('6h 12m');

  React.useEffect(() => {
    // Calculate time left until next reset based on period
    const calculateTimeLeft = () => {
      const now = new Date();
      if (selectedPeriod === 'daily') {
        // Count down to next midnight
        const tomorrow = new Date(now);
        tomorrow.setHours(24, 0, 0, 0);
        const diff = tomorrow.getTime() - now.getTime();

        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
      } else {
        // Count down to next Monday
        const target = new Date(now);
        target.setDate(now.getDate() + (1 + 7 - now.getDay()) % 7); // Next Monday
        target.setHours(0, 0, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 7);

        const diff = target.getTime() - now.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        if (days > 0) return `${days}d ${hours}h`;
        return `${hours}h`;
      }
    };

    // Update immediately
    setTimeLeft(calculateTimeLeft());

    // Update every minute
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 60000);

    return () => clearInterval(timer);
  }, [selectedPeriod]);

  return (
    <Animated.View
      entering={FadeIn.duration(500)}
      style={[styles.header, { paddingTop: insets.top + spacing.md }]}
    >
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Leaderboard</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>Earnings from verified proofs</Text>

      {/* Period Tabs */}
      <View style={[styles.tabContainer, { backgroundColor: colors.warmGray }]}>
        {periods.map((period) => (
          <TouchableOpacity
            key={period.key}
            style={[
              styles.tab,
              selectedPeriod === period.key && [styles.tabActive, { backgroundColor: colors.cardBackground }, shadows.sm],
            ]}
            onPress={() => onPeriodChange(period.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabText,
                { color: colors.textMuted },
                selectedPeriod === period.key && { color: colors.provenGreen },
              ]}
            >
              {period.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.resetText, { color: colors.textMuted }]}>
        {selectedPeriod === 'daily' ? 'Resets every 24h' : 'Resets every Monday'} • <Text style={[styles.timerText, { color: colors.warning }]}>Next reset in {timeLeft}</Text>
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typography.heading1,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.caption,
    marginBottom: spacing.lg,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: borderRadius.md,
    padding: spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  tabActive: {},
  tabText: {
    ...typography.caption,
    fontWeight: '600',
  },
  resetText: {
    ...typography.small,
    textAlign: 'center',
    marginTop: spacing.sm,
    opacity: 0.8,
  },
  timerText: {
    fontWeight: '700',
  },
});
