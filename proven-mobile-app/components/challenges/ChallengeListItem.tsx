import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { borderRadius, colors, shadows, spacing, typography } from '../../constants/theme';
import { Challenge } from '../../services/challengeService';
import { StatusPill } from '../ui/StatusPill';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ChallengeListItemProps {
  challenge: Challenge & {
    todayStatus?: 'pending' | 'under_review' | 'approved' | 'rejected';
    earnedAmount?: number;
  };
  index: number;
  isCompleted?: boolean;
}

export function ChallengeListItem({
  challenge,
  index,
  isCompleted = false
}: ChallengeListItemProps) {
  const router = useRouter();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 150 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  };

  const handlePress = () => {
    // Navigate to challenge detail - pass isActive param for active challenges
    const isActive = challenge.status === 'active';
    router.push({
      pathname: '/challenge/[id]',
      params: {
        id: challenge.id,
        isActive: isActive ? 'true' : 'false'
      }
    });
  };

  const getTodayStatusConfig = () => {
    switch (challenge.todayStatus) {
      case 'approved':
        return { label: 'Approved', color: '#4CAF50' };
      case 'rejected':
        return { label: 'Rejected', color: '#D65D5D' };
      case 'under_review':
        return { label: 'Pending', color: '#F59E0B' };
      case 'pending':
      default:
        return { label: 'Not submitted', color: '#FF5757' };
    }
  };

  const todayConfig = getTodayStatusConfig();

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(index * 80).springify()}
    >
      <AnimatedPressable
        style={[styles.cardContainer, animatedStyle]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
      >
        {/* Full Image Background */}
        <Image
          source={{ uri: challenge.imageUrl || challenge.image }}
          style={styles.cardImage}
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

        {/* Status Pill */}
        <View style={styles.statusPillContainer}>
          <StatusPill status={isCompleted ? 'completed' : (challenge.status || 'active')} />
        </View>

        {/* Content Overlay */}
        <View style={styles.cardContent}>
          {/* Category */}
          <View style={styles.categoryBadge}>
            <View style={styles.categoryIcon}>
              <Ionicons name="fitness" size={12} color="#FFFFFF" />
            </View>
            <Text style={styles.categoryText}>
              {(challenge.category || challenge.metrics || 'CHALLENGE').toUpperCase()}
            </Text>
          </View>

          {/* Title */}
          <Text style={styles.cardTitle}>{challenge.title}</Text>

          {/* Details Row */}
          <View style={styles.detailsRow}>
            {/* Stake */}
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Stake</Text>
              <Text style={styles.stakeText}>${challenge.stakeAmount}</Text>
            </View>

            <View style={styles.verticalDivider} />

            {/* Duration */}
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Duration</Text>
              <Text style={styles.durationText}>{challenge.timeline}</Text>
            </View>

            {/* Sorting/Status Metric */}
            <View style={styles.verticalDivider} />

            <View style={styles.detailItem}>
              {isCompleted ? (
                <>
                  <Text style={styles.detailLabel}>Earned</Text>
                  <Text style={[styles.statusText, { color: '#4CAF50' }]}>
                    ${challenge.earnedAmount ?? (challenge.stakeAmount * 1.5)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.detailLabel}>Today</Text>
                  <Text style={[styles.statusText, { color: todayConfig.color }]}>
                    {todayConfig.label}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    height: 340, // Slightly smaller than the main swipe card
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginBottom: spacing.md,
    ...shadows.md,
  },
  cardImage: {
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
  cardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: spacing.lg,
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
  cardTitle: {
    fontSize: 22,
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
    gap: spacing.md, // Reduced gap to fit 3 items
  },
  detailItem: {
    // 
  },
  verticalDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: spacing.xs,
  },
  detailLabel: {
    fontSize: 12,
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
  statusText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
