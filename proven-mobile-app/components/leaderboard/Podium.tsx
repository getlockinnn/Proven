import { borderRadius, spacing, typography } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { LeaderboardEntry } from '@/services/leaderboardService';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInUp } from 'react-native-reanimated';

interface PodiumProps {
  data: LeaderboardEntry[];
}

export function Podium({ data }: PodiumProps) {
  const { colors } = useTheme();
  const top3 = data.slice(0, 3);

  // Allow podium rendering for partial leaderboards (1-2 users) as well.
  if (top3.length === 0) return null;

  const first = top3[0];
  const second = top3.length >= 2 ? top3[1] : null;
  const third = top3.length >= 3 ? top3[2] : null;

  const formatEarnings = (amount: number) => {
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}k`;
    }
    return `$${amount.toFixed(2)}`;
  };

  return (
    <Animated.View
      entering={FadeInUp.duration(600).springify()}
      style={styles.podiumContainer}
    >
      {/* Second Place */}
      {second ? (
        <View style={styles.podiumItem}>
          <View style={[styles.podiumAvatarContainer, styles.podiumSecond]}>
            <Image source={{ uri: second.avatar }} style={[styles.podiumAvatar, { borderColor: colors.softPurple }]} transition={200} cachePolicy="disk" />
            <View style={[styles.rankBadge, styles.rankBadgeSecond, { borderColor: colors.background, backgroundColor: colors.softPurple }]}>
              <Text style={styles.rankBadgeText}>2</Text>
            </View>
          </View>
          <Text style={[styles.podiumName, { color: colors.textPrimary }]} numberOfLines={1}>{second.name}</Text>
          <Text style={[styles.podiumEarnings, { color: colors.textMuted }]}>{formatEarnings(second.earnings)}</Text>
          <View style={[styles.podiumBar, styles.podiumBarSecond, { backgroundColor: colors.softPurple }]} />
        </View>
      ) : (
        <View style={styles.podiumItem} />
      )}

      {/* First Place */}
      <View style={styles.podiumItem}>
        <View style={styles.crownContainer}>
          <Ionicons name="trophy" size={28} color={colors.warning} />
        </View>
        <View style={[styles.podiumAvatarContainer, styles.podiumFirst]}>
          <Image source={{ uri: first.avatar }} style={[styles.podiumAvatarLarge, { borderColor: colors.provenGreen }]} transition={200} cachePolicy="disk" />
          <View style={[styles.rankBadge, styles.rankBadgeFirst, { borderColor: colors.background, backgroundColor: colors.provenGreen }]}>
            <Text style={styles.rankBadgeText}>1</Text>
          </View>
        </View>
        <Text style={[styles.podiumName, { color: colors.textPrimary }]} numberOfLines={1}>{first.name}</Text>
        <Text style={[styles.podiumEarnings, styles.podiumEarningsFirst, { color: colors.provenGreen }]}>
          {formatEarnings(first.earnings)}
        </Text>
        <View style={[styles.podiumBar, styles.podiumBarFirst, { backgroundColor: colors.provenGreen }]} />
      </View>

      {/* Third Place */}
      {third ? (
        <View style={styles.podiumItem}>
          <View style={[styles.podiumAvatarContainer, styles.podiumThird]}>
            <Image source={{ uri: third.avatar }} style={[styles.podiumAvatar, { borderColor: colors.warning }]} transition={200} cachePolicy="disk" />
            <View style={[styles.rankBadge, styles.rankBadgeThird, { borderColor: colors.background, backgroundColor: colors.warning }]}>
              <Text style={styles.rankBadgeText}>3</Text>
            </View>
          </View>
          <Text style={[styles.podiumName, { color: colors.textPrimary }]} numberOfLines={1}>{third.name}</Text>
          <Text style={[styles.podiumEarnings, { color: colors.textMuted }]}>{formatEarnings(third.earnings)}</Text>
          <View style={[styles.podiumBar, styles.podiumBarThird, { backgroundColor: colors.warning }]} />
        </View>
      ) : (
        <View style={styles.podiumItem} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  podiumContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
  },
  podiumItem: {
    alignItems: 'center',
    flex: 1,
  },
  crownContainer: {
    marginBottom: spacing.sm,
  },
  podiumAvatarContainer: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  podiumFirst: {},
  podiumSecond: {},
  podiumThird: {},
  podiumAvatar: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.full,
    borderWidth: 3,
  },
  podiumAvatarLarge: {
    width: 76,
    height: 76,
    borderRadius: borderRadius.full,
    borderWidth: 4,
  },
  rankBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  rankBadgeFirst: {},
  rankBadgeSecond: {},
  rankBadgeThird: {},
  rankBadgeText: {
    ...typography.small,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  podiumName: {
    ...typography.caption,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 80,
  },
  podiumEarnings: {
    ...typography.small,
    marginTop: 2,
    fontWeight: '600',
  },
  podiumEarningsFirst: {
    fontWeight: '700',
  },
  podiumBar: {
    width: '80%',
    borderTopLeftRadius: borderRadius.sm,
    borderTopRightRadius: borderRadius.sm,
    marginTop: spacing.sm,
  },
  podiumBarFirst: {
    height: 100,
  },
  podiumBarSecond: {
    height: 70,
  },
  podiumBarThird: {
    height: 50,
  },
});
