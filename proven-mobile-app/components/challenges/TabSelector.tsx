import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

export type TabType = 'active' | 'completed';

interface TabSelectorProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export function TabSelector({ activeTab, onTabChange }: TabSelectorProps) {
  const { colors, shadows } = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const indicatorPosition = useSharedValue(activeTab === 'active' ? 0 : 1);

  React.useEffect(() => {
    indicatorPosition.value = withTiming(activeTab === 'active' ? 0 : 1, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
  }, [activeTab]);

  const onLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  const paddedWidth = containerWidth - 8; // minus padding * 2
  const tabWidth = paddedWidth / 2;

  const indicatorStyle = useAnimatedStyle(() => {
    if (tabWidth <= 0) return {};
    return {
      width: tabWidth,
      transform: [{ translateX: interpolate(indicatorPosition.value, [0, 1], [0, tabWidth]) }],
    };
  }, [tabWidth]);

  return (
    <View style={[styles.tabContainer, { backgroundColor: colors.warmGray }]} onLayout={onLayout}>
      {containerWidth > 0 && (
        <Animated.View style={[styles.tabIndicator, { backgroundColor: colors.cardBackground }, shadows.sm, indicatorStyle]} />
      )}
      <Pressable
        style={styles.tab}
        onPress={() => onTabChange('active')}
      >
        <Text style={[
          styles.tabText,
          { color: colors.textMuted },
          activeTab === 'active' && { color: colors.textPrimary }
        ]}>
          Active
        </Text>
      </Pressable>
      <Pressable
        style={styles.tab}
        onPress={() => onTabChange('completed')}
      >
        <Text style={[
          styles.tabText,
          { color: colors.textMuted },
          activeTab === 'completed' && { color: colors.textPrimary }
        ]}>
          Completed
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    padding: 4,
    marginBottom: spacing.lg,
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    height: 40,
    borderRadius: borderRadius.md,
  },
  tab: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  tabText: {
    ...typography.bodyBold,
  },
});
