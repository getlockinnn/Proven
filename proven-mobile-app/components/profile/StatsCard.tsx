import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

interface StatsCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  value: string | number;
  label: string;
  subtext?: string;
  color: string;
  index: number;
}

export function StatsCard({ icon, value, label, subtext, color, index }: StatsCardProps) {
  const { colors, shadows } = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(index * 100)}
      style={[styles.statsCard, { backgroundColor: colors.cardBackground }, shadows.sm]}
    >
      <View style={[styles.statsIconContainer, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.statsValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statsLabel, { color: colors.textMuted }]}>{label}</Text>
      {subtext ? (
        <Text style={[styles.statsSubtext, { color: colors.textMuted }]}>{subtext}</Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  statsCard: {
    width: '47%',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  statsIconContainer: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statsValue: {
    ...typography.heading2,
  },
  statsLabel: {
    ...typography.small,
    marginTop: 2,
  },
  statsSubtext: {
    ...typography.caption,
    marginTop: 2,
  },
});
