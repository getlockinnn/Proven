import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { colors, spacing, typography, borderRadius } from '../../constants/theme';
import { Challenge } from '../../services/challengeService';
import { SwipeCard } from './SwipeCard';

interface SwipeDeckProps {
  challenges: Challenge[];
  onCardPress?: (challenge: Challenge) => void;
}

export function SwipeDeck({ challenges, onCardPress }: SwipeDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Infinite circular swiping
  const handleSwipeRight = useCallback(() => {
    if (challenges.length === 0) return; // Guard against div by zero
    setCurrentIndex((prev) => (prev + 1) % challenges.length);
  }, [challenges.length]);

  const handleSwipeLeft = useCallback(() => {
    if (challenges.length === 0) return; // Guard against div by zero
    setCurrentIndex((prev) => (prev - 1 + challenges.length) % challenges.length);
  }, [challenges.length]);

  const handleCardPress = useCallback(
    (challenge: Challenge) => {
      if (onCardPress) {
        onCardPress(challenge);
      }
    },
    [onCardPress]
  );

  // Get visible cards with circular wrapping (current + next 2 for stack effect)
  const visibleCards = useMemo(() => {
    const cards = [];
    for (let i = 0; i < Math.min(3, challenges.length); i++) {
      const index = (currentIndex + i) % challenges.length;
      cards.push({
        challenge: challenges[index],
        stackIndex: i,
        actualIndex: index,
      });
    }
    return cards;
  }, [currentIndex, challenges]);

  if (challenges.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No challenges available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Card Stack */}
      <View style={styles.deckContainer}>
        {[...visibleCards].reverse().map(({ challenge, stackIndex }) => (
          <SwipeCard
            key={challenge.id}
            challenge={challenge}
            index={stackIndex}
            totalCards={visibleCards.length}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
            onCardPress={() => handleCardPress(challenge)}
          />
        ))}
      </View>

      {/* Navigation Dots */}
      <Animated.View entering={FadeIn.delay(300)} style={styles.dotsContainer}>
        {challenges.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index === currentIndex && styles.dotActive,
            ]}
          />
        ))}
      </Animated.View>

      {/* Swipe Hint */}
      <Animated.View entering={FadeIn.delay(500)} style={styles.hintContainer}>
        <Text style={styles.hintText}>
          {`${currentIndex + 1} of ${challenges.length}`}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  deckContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.provenGreen,
  },
  hintContainer: {
    alignItems: 'center',
    paddingBottom: spacing.xs,
  },
  hintText: {
    ...typography.small,
    color: colors.textMuted,
  },
});

