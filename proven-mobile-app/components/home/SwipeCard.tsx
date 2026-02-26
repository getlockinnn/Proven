import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { borderRadius, colors, shadows, spacing, typography } from '../../constants/theme';
import { Challenge } from '../../services/challengeService';
import { StatusPill } from '../ui/StatusPill';

// Get appropriate icon for challenge category
const getCategoryIcon = (category?: string): keyof typeof Ionicons.glyphMap => {
  const cat = (category || '').toLowerCase();
  if (cat.includes('fitness') || cat.includes('workout') || cat.includes('exercise')) return 'fitness';
  if (cat.includes('meditation') || cat.includes('mindfulness')) return 'leaf';
  if (cat.includes('wellness') || cat.includes('health')) return 'heart';
  if (cat.includes('nutrition') || cat.includes('food') || cat.includes('diet')) return 'nutrition';
  if (cat.includes('reading') || cat.includes('learning')) return 'book';
  if (cat.includes('sleep')) return 'moon';
  if (cat.includes('digital') || cat.includes('screen')) return 'phone-portrait';
  return 'trophy';
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.12;
const CARD_WIDTH = SCREEN_WIDTH - spacing.lg * 2;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.72;

interface SwipeCardProps {
  challenge: Challenge;
  index: number;
  totalCards: number;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onCardPress?: () => void;
}

export function SwipeCard({
  challenge,
  index,
  totalCards,
  onSwipeLeft,
  onSwipeRight,
  onCardPress,
}: SwipeCardProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isTopCard = index === 0;

  // Reset position when card enters the visible stack
  React.useEffect(() => {
    translateX.value = 0;
    translateY.value = 0;
  }, [index]);

  const panGesture = Gesture.Pan()
    .enabled(isTopCard)
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY * 0.15;
    })
    .onEnd((event) => {
      const velocity = event.velocityX;
      const shouldSwipe = Math.abs(event.translationX) > SWIPE_THRESHOLD || Math.abs(velocity) > 400;

      if (shouldSwipe) {
        const direction = event.translationX > 0 ? 1 : -1;

        // Trigger callback IMMEDIATELY - don't wait for animation
        if (direction > 0) {
          runOnJS(onSwipeRight)();
        } else {
          runOnJS(onSwipeLeft)();
        }

        // Animate card off screen (fast timing animation)
        translateX.value = withTiming(
          direction * SCREEN_WIDTH * 1.5,
          { duration: 200, easing: Easing.out(Easing.ease) }
        );
      } else {
        // Snap back smoothly
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
      [-12, 0, 12],
      Extrapolation.CLAMP
    );

    const scale = isTopCard
      ? 1
      : interpolate(
        Math.abs(translateX.value),
        [0, SWIPE_THRESHOLD],
        [0.92, 1],
        Extrapolation.CLAMP
      );

    const translateYOffset = isTopCard
      ? translateY.value
      : interpolate(
        Math.abs(translateX.value),
        [0, SWIPE_THRESHOLD],
        [30, 0],
        Extrapolation.CLAMP
      );

    return {
      transform: [
        { translateX: isTopCard ? translateX.value : 0 },
        { translateY: translateYOffset },
        { rotate: isTopCard ? `${rotate}deg` : '0deg' },
        { scale },
      ],
      zIndex: totalCards - index,
      opacity: index > 2 ? 0 : 1,
    };
  });

  const tapGesture = Gesture.Tap()
    .enabled(isTopCard)
    .onEnd(() => {
      if (onCardPress) {
        runOnJS(onCardPress)();
      }
    });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[styles.cardContainer, cardStyle]}>
        <View style={styles.card}>
          {/* Full Screen Image */}
          <Image
            source={{ uri: challenge.imageUrl }}
            style={styles.image}
            contentFit="cover"
            transition={200}
            cachePolicy="disk"
          />

          {/* Gradient Overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.85)']}
            style={styles.gradientOverlay}
            locations={[0.4, 1]}
          />

          <View style={styles.statusPillContainer}>
            <StatusPill status={challenge.status} />
          </View>

          {/* Content Section - Overlaid at Bottom */}
          <View style={styles.content}>
            {/* Category */}
            <View style={styles.categoryBadge}>
              <View style={styles.categoryIcon}>
                <Ionicons name={getCategoryIcon(challenge.category)} size={12} color="#FFFFFF" />
              </View>
              <Text style={styles.categoryText}>{(challenge.category || 'General').toUpperCase()}</Text>
            </View>

            {/* Title */}
            <Text style={styles.title}>{challenge.title}</Text>



            {/* Secondary Details: Stake & Duration */}
            <View style={styles.detailsRow}>
              {/* Stake - "at risk" */}
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Stake</Text>
                <Text style={styles.stakeText}>${challenge.stakeAmount} at risk</Text>
              </View>

              <View style={styles.verticalDivider} />

              {/* Duration */}
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Duration</Text>
                <Text style={styles.durationText}>{challenge.timeline}</Text>
              </View>
            </View>
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    position: 'absolute',
    top: 0,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignSelf: 'center',
  },
  card: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.lg,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  statusPillContainer: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 10,
  },
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  categoryIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.provenGreen,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: spacing.md,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.xl,
  },
  detailItem: {
    // 
  },
  verticalDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: spacing.sm,
  },
  detailLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  stakeText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  durationText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
