import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

interface MenuSectionProps {
  title: string;
  children: React.ReactNode;
  delay?: number;
}

export function MenuSection({ title, children, delay = 300 }: MenuSectionProps) {
  const { colors, shadows } = useTheme();

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(delay)}
      style={styles.menuSection}
    >
      <Text style={[styles.menuSectionTitle, { color: colors.textMuted }]}>{title}</Text>
      <View style={[styles.menuCard, { backgroundColor: colors.cardBackground }, shadows.sm]}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  menuSection: {
    marginBottom: spacing.lg,
  },
  menuSectionTitle: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuCard: {
    borderRadius: borderRadius.lg,
  },
});
