import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Dimensions, StyleSheet, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { borderRadius, colors, spacing } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BUTTON_HEIGHT = 64;
const THUMB_SIZE = 52;
const CONTAINER_PADDING = 6;
const SWIPE_RANGE = SCREEN_WIDTH - spacing.lg * 2 - CONTAINER_PADDING * 2 - THUMB_SIZE;

interface SwipeButtonProps {
  onSwipeComplete: () => void;
  label?: string;
  disabled?: boolean;
}

export function SwipeButton({
  onSwipeComplete,
  label = 'Swipe to Join',
  disabled = false,
}: SwipeButtonProps) {
  const translateX = useSharedValue(0);
  const isCompleted = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .enabled(!disabled && !isCompleted.value)
    .onUpdate((event) => {
      const clampedX = Math.max(0, Math.min(event.translationX, SWIPE_RANGE));
      translateX.value = clampedX;
    })
    .onEnd(() => {
      if (translateX.value > SWIPE_RANGE * 0.7) {
        // Complete the swipe
        translateX.value = withSpring(SWIPE_RANGE, { damping: 15, stiffness: 150 });
        isCompleted.value = true;
        runOnJS(onSwipeComplete)();
      } else {
        // Snap back
        translateX.value = withSpring(0, { damping: 15, stiffness: 150 });
      }
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: translateX.value + THUMB_SIZE + CONTAINER_PADDING,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SWIPE_RANGE * 0.5],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [SWIPE_RANGE * 0.7, SWIPE_RANGE],
      [0, 1],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        scale: interpolate(
          translateX.value,
          [SWIPE_RANGE * 0.7, SWIPE_RANGE],
          [0.5, 1],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const containerStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      translateX.value,
      [0, SWIPE_RANGE],
      [colors.provenGreen, colors.success]
    );
    return { backgroundColor };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.container, containerStyle, disabled && styles.disabled]}>
        {/* Progress Fill */}
        <Animated.View style={[styles.progressFill, progressStyle]} />

        {/* Swipe Label */}
        <Animated.View style={[styles.labelContainer, textStyle]}>
          <Text style={styles.label}>{label}</Text>
        </Animated.View>

        {/* Completed Check */}
        <Animated.View style={[styles.checkContainer, checkStyle]}>
          <Ionicons name="checkmark" size={24} color="#FFFFFF" />
          <Text style={styles.completedText}>Joined!</Text>
        </Animated.View>

        {/* Draggable Thumb */}
        <Animated.View style={[styles.thumb, thumbStyle]}>
          <Ionicons name="chevron-forward" size={24} color={colors.provenGreen} />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    height: BUTTON_HEIGHT,
    width: '100%',
    borderRadius: borderRadius.lg,
    backgroundColor: colors.provenGreen,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  disabled: {
    opacity: 0.5,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
    borderRadius: borderRadius.lg,
  },
  labelContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  checkContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  completedText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  thumb: {
    position: 'absolute',
    left: CONTAINER_PADDING,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: borderRadius.md,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
