import React from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

interface ChallengesHeaderProps { }

export function ChallengesHeader({ }: ChallengesHeaderProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <Animated.View
      entering={FadeIn.duration(500)}
      style={[styles.header, { paddingTop: insets.top + spacing.md }]}
    >
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>My Habits</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typography.heading1,
  },
});
