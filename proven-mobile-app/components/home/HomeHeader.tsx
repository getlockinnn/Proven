import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getCurrentUser, User } from '../../services/userService';

export function HomeHeader() {
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Skeleton animation
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.6, { duration: 1000 }), -1, true);
  }, []);

  const skeletonStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const loadUser = useCallback(async () => {
    try {
      setLoading(true);
      const userData = await getCurrentUser();
      if (userData) {
        setUser(userData);
      }
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setUser(null);
      setLoading(false);
      return;
    }

    loadUser();
  }, [authLoading, isAuthenticated, loadUser]);

  const walletBalance = user?.walletBalance ?? 0;

  return (
    <Animated.View
      entering={FadeInDown.duration(600).springify()}
      style={[styles.header, { paddingTop: insets.top + spacing.md, backgroundColor: colors.background }]}
    >
      <View style={styles.headerLeft}>
        {loading ? (
          <Animated.View style={[styles.profilePictureSkeleton, { backgroundColor: colors.warmGray }, skeletonStyle]} />
        ) : (
          <Image
            source={{ uri: user?.profilePicture || `${process.env.EXPO_PUBLIC_DEFAULT_AVATAR_BASE_URL}default` }}
            style={[styles.profilePicture, { borderColor: colors.provenGreen }]}
            transition={200}
            cachePolicy="disk"
          />
        )}
        <View style={styles.greetingContainer}>
          {loading ? (
            <Animated.View style={[styles.nameSkeletonContainer, skeletonStyle]}>
              <View style={[styles.greetingSkeleton, { backgroundColor: colors.warmGray }]} />
              <View style={[styles.nameSkeleton, { backgroundColor: colors.warmGray }]} />
            </Animated.View>
          ) : (
            <>
              <Text style={[styles.greetingText, { color: colors.textSecondary }]}>Hey,</Text>
              <Text style={[styles.userName, { color: colors.textPrimary }]}>{user?.name || 'User'} 👋</Text>
            </>
          )}
        </View>
      </View>

      <View style={styles.headerRight}>
        {/* Wallet Balance */}
        {loading ? (
          <Animated.View style={[styles.walletChipSkeleton, { backgroundColor: colors.warmGray }, skeletonStyle]} />
        ) : (
          <View style={[styles.walletChip, { backgroundColor: colors.cardBackground, borderColor: colors.border }, shadows.sm]}>
            <Ionicons name="wallet" size={16} color={colors.provenGreen} />
            <Text style={[styles.walletAmount, { color: colors.textPrimary }]}>
              ${walletBalance.toFixed(2)}
            </Text>
          </View>
        )}

        {/* Notification Bell */}
        <Pressable
          style={[styles.bellButton, { backgroundColor: colors.cardBackground, borderColor: colors.border }, shadows.sm]}
          onPress={() => router.push('/notifications-alerts')}
          hitSlop={8}
        >
          <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  profilePicture: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    borderWidth: 2,
  },
  profilePictureSkeleton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  greetingContainer: {
    gap: 2,
  },
  greetingText: {
    ...typography.caption,
  },
  userName: {
    ...typography.heading3,
  },
  nameSkeletonContainer: {
    gap: 6,
  },
  greetingSkeleton: {
    width: 30,
    height: 14,
    borderRadius: borderRadius.sm,
  },
  nameSkeleton: {
    width: 120,
    height: 24,
    borderRadius: borderRadius.sm,
  },
  walletChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  walletChipSkeleton: {
    width: 80,
    height: 36,
    borderRadius: borderRadius.full,
  },
  walletAmount: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 13,
  },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
