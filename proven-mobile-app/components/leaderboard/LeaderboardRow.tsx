import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { FollowButton } from '../social';

interface LeaderboardRowProps {
  rank: number;
  name: string;
  earnings: number;
  avatar: string;
  isCurrentUser?: boolean;
  index: number;
  gapToNext?: number;
  userId?: string;
  onPress?: () => void;
}

export function LeaderboardRow({
  rank,
  name,
  earnings,
  avatar,
  isCurrentUser = false,
  index,
  gapToNext,
  userId,
  onPress,
}: LeaderboardRowProps) {
  const { colors, shadows } = useTheme();

  const formatEarnings = (amount: number) => {
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}k`;
    }
    return `$${amount.toFixed(2)}`;
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(index * 60)}
      style={[
        styles.leaderboardRow,
        { backgroundColor: colors.cardBackground },
        shadows.sm,
        isCurrentUser && {
          backgroundColor: `${colors.provenGreen}15`,
          borderWidth: 2,
          borderColor: colors.provenGreen,
        }
      ]}
    >
      <Pressable onPress={onPress} disabled={!onPress} style={styles.rowPressArea}>
        <Text style={[
          styles.rankNumber,
          { color: colors.textMuted },
          isCurrentUser && { color: colors.provenGreen, fontWeight: '800' }
        ]}>
          {rank}
        </Text>

        <Image source={{ uri: avatar }} style={styles.rowAvatar} transition={200} cachePolicy="disk" />

        <View style={styles.rowContent}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[
                styles.rowName,
                { color: colors.textPrimary },
                isCurrentUser && { color: colors.provenGreen, fontWeight: '800' }
              ]}>
                {name}
              </Text>
              {isCurrentUser && (
                <View style={[styles.youBadge, { backgroundColor: colors.provenGreen }]}>
                  <Text style={styles.youBadgeText}>You</Text>
                </View>
              )}
            </View>

            {/* Pressure Signal */}
            {gapToNext !== undefined && (
              <Text style={[styles.gapText, { color: colors.warning }]}>
                +${gapToNext} to rank {rank - 1}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.earningsContainer}>
          <Text style={[
            styles.rowEarnings,
            { color: colors.textPrimary },
            isCurrentUser && { color: colors.provenGreen, fontWeight: '900', fontSize: 18, opacity: 1 }
          ]}>
            {formatEarnings(earnings)}
          </Text>
          <Text style={[styles.earningsLabel, { color: colors.textMuted }]}>earned</Text>
        </View>
      </Pressable>

      {userId && !isCurrentUser && <FollowButton profileId={userId} size="sm" />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  rowPressArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rankNumber: {
    ...typography.bodyBold,
    width: 24,
    textAlign: 'center',
  },
  rowAvatar: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
  },
  rowContent: {
    flex: 1,
    justifyContent: 'center',
  },
  rowName: {
    ...typography.body,
    fontWeight: '600',
  },
  youBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  youBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  gapText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  earningsContainer: {
    alignItems: 'flex-end',
  },
  rowEarnings: {
    ...typography.bodyBold,
    opacity: 0.8,
  },
  earningsLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});
