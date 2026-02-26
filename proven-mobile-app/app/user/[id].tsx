import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useTapestry } from '../../context/TapestryContext';
import { FeedCard, FollowButton } from '../../components/social';
import {
  findOrCreateProfile,
  getProfile,
  getUserProofEvents,
  likeContent,
  ProofEvent,
  TapestryProfileWithSocial,
  unlikeContent,
} from '../../services/tapestryService';
import { fetchLeaderboard, LeaderboardEntry } from '../../services/leaderboardService';

const DEFAULT_AVATAR_BASE =
  process.env.EXPO_PUBLIC_DEFAULT_AVATAR_BASE_URL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=';

const toUsernameSeed = (value: string) => {
  const normalized = (value || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return (normalized || 'user').slice(0, 32);
};

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const { tapestryProfileId } = useTapestry();

  const [profile, setProfile] = useState<TapestryProfileWithSocial | null>(null);
  const [leaderboardEntry, setLeaderboardEntry] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [proofEvents, setProofEvents] = useState<ProofEvent[]>([]);
  const [proofEventsLoading, setProofEventsLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    void loadUserData(id);
  }, [id]);

  const loadUserData = async (targetUserId: string) => {
    try {
      setLoading(true);
      setError(false);

      const [initialProfile, weeklyLeaderboard] = await Promise.all([
        getProfile(targetUserId),
        fetchLeaderboard('weekly'),
      ]);

      const fallback = weeklyLeaderboard.find((e) => e.userId === targetUserId) || null;
      let tapestryProfile = initialProfile;

      if (!tapestryProfile && fallback) {
        try {
          tapestryProfile = await findOrCreateProfile({
            id: fallback.userId,
            username: toUsernameSeed(fallback.name || fallback.userId),
            name: fallback.name || 'User',
            walletAddress: null,
            profilePicture: fallback.avatar || '',
          });
        } catch (createError) {
          console.error('[UserProfile] Failed to create fallback Tapestry profile:', createError);
        }
      }

      if (tapestryProfile) {
        setProfile(tapestryProfile);
      } else {
        if (!fallback) {
          setError(true);
          return;
        }
        setProfile({
          profile: {
            id: fallback.userId,
            namespace: 'proven',
            created_at: 0,
            username: fallback.name,
            image: fallback.avatar,
          },
          socialCounts: { followers: 0, following: 0 },
        });
      }

      setLeaderboardEntry(fallback);
    } catch (err) {
      console.error('[UserProfile] Error loading user data:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(colors);
  const resolvedProfileId = profile?.profile.id || id || '';
  const isOwnProfile = tapestryProfileId === resolvedProfileId;
  const displayName = leaderboardEntry?.name || profile?.profile.username || id || 'User';
  const displayHandle = profile?.profile.username
    ? `@${profile.profile.username}`
    : profile?.profile.id
      ? `@${profile.profile.id}`
      : null;
  const avatarUri = profile?.profile.image || `${DEFAULT_AVATAR_BASE}${id}`;
  const followers = profile?.socialCounts?.followers ?? 0;
  const following = profile?.socialCounts?.following ?? 0;

  useEffect(() => {
    if (!resolvedProfileId) {
      setProofEvents([]);
      setProofEventsLoading(false);
      return;
    }

    let mounted = true;

    const loadProofEvents = async () => {
      try {
        setProofEventsLoading(true);
        const events = await getUserProofEvents(resolvedProfileId, tapestryProfileId || undefined, 10, 0);
        if (mounted) {
          setProofEvents(events);
        }
      } catch (eventsError) {
        console.error('[UserProfile] Error loading proof events:', eventsError);
        if (mounted) {
          setProofEvents([]);
        }
      } finally {
        if (mounted) {
          setProofEventsLoading(false);
        }
      }
    };

    void loadProofEvents();

    return () => {
      mounted = false;
    };
  }, [resolvedProfileId, tapestryProfileId]);

  const handleToggleLike = async (eventId: string, hasLiked: boolean) => {
    if (!tapestryProfileId) return;

    setProofEvents((previous) =>
      previous.map((event) =>
        event.id === eventId
          ? {
              ...event,
              engagement: {
                ...event.engagement,
                hasLiked: !hasLiked,
                likes: Math.max(0, event.engagement.likes + (hasLiked ? -1 : 1)),
              },
            }
          : event
      )
    );

    try {
      if (hasLiked) {
        await unlikeContent(tapestryProfileId, eventId);
      } else {
        await likeContent(tapestryProfileId, eventId);
      }
    } catch (likeError) {
      console.error('[UserProfile] Failed to toggle like:', likeError);
      setProofEvents((previous) =>
        previous.map((event) =>
          event.id === eventId
            ? {
                ...event,
                engagement: {
                  ...event.engagement,
                  hasLiked,
                  likes: Math.max(0, event.engagement.likes + (hasLiked ? 1 : -1)),
                },
              }
            : event
        )
      );
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.headerBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.provenGreen} />
        </View>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.headerBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="person-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>User not found</Text>
          <Text style={[styles.errorSubtitle, { color: colors.textMuted }]}>
            This profile may not exist or is unavailable.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {displayName}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={FadeInDown.duration(350)}
          style={[styles.profileCard, { backgroundColor: colors.cardBackground }, shadows.md]}
        >
          <Image source={{ uri: avatarUri }} style={styles.avatar} transition={200} cachePolicy="disk" />
          <Text style={[styles.name, { color: colors.textPrimary }]}>{displayName}</Text>
          {displayHandle ? <Text style={[styles.handle, { color: colors.textMuted }]}>{displayHandle}</Text> : null}
          {profile.profile.bio ? (
            <Text style={[styles.bio, { color: colors.textMuted }]}>{profile.profile.bio}</Text>
          ) : null}

          <Text style={[styles.socialText, { color: colors.textMuted }]}>
            {followers} followers · {following} following
          </Text>

          {!isOwnProfile && resolvedProfileId ? (
            <FollowButton profileId={resolvedProfileId} size="md" style={{ marginTop: spacing.md }} />
          ) : null}
        </Animated.View>

        {leaderboardEntry ? (
          <Animated.View entering={FadeInDown.duration(350).delay(80)} style={styles.statsBlock}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Stats</Text>
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: colors.cardBackground }, shadows.sm]}>
                <Ionicons name="trophy" size={20} color={colors.provenGreen} />
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>#{leaderboardEntry.rank}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Weekly Rank</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.cardBackground }, shadows.sm]}>
                <Ionicons name="cash" size={20} color={colors.provenGreen} />
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                  ${leaderboardEntry.earnings || leaderboardEntry.earned || 0}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Earned</Text>
              </View>
            </View>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.duration(350).delay(140)} style={styles.activityBlock}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Proof Activity</Text>

          {proofEventsLoading ? (
            <View style={styles.activityLoadingContainer}>
              <ActivityIndicator size="small" color={colors.provenGreen} />
            </View>
          ) : null}

          {!proofEventsLoading && proofEvents.length === 0 ? (
            <View style={[styles.activityEmptyCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
              <Text style={[styles.activityEmptyText, { color: colors.textMuted }]}>No proof activity yet.</Text>
            </View>
          ) : null}

          {!proofEventsLoading
            ? proofEvents.map((event, index) => (
                <View key={event.id} style={index > 0 ? styles.feedItemSpacing : undefined}>
                  <FeedCard
                    event={event}
                    onToggleLike={handleToggleLike}
                    onPressAuthor={(profileId) => router.push(`/user/${profileId}`)}
                    onPressChallenge={(challengeId) => router.push(`/challenge/${challengeId}`)}
                  />
                </View>
              ))
            : null}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      ...typography.bodyBold,
      flex: 1,
      textAlign: 'center',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      gap: spacing.sm,
    },
    errorTitle: {
      ...typography.heading3,
      marginTop: spacing.md,
    },
    errorSubtitle: {
      ...typography.body,
      textAlign: 'center',
    },
    profileCard: {
      borderRadius: borderRadius.xl,
      padding: spacing.lg,
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    avatar: {
      width: 96,
      height: 96,
      borderRadius: borderRadius.full,
      marginBottom: spacing.md,
    },
    name: {
      ...typography.heading2,
      textAlign: 'center',
    },
    handle: {
      ...typography.body,
      marginTop: 2,
    },
    bio: {
      ...typography.body,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    socialText: {
      ...typography.body,
      marginTop: spacing.sm,
    },
    statsBlock: {
      marginBottom: spacing.lg,
    },
    activityBlock: {
      marginBottom: spacing.lg,
    },
    activityLoadingContainer: {
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    activityEmptyCard: {
      borderRadius: borderRadius.lg,
      borderWidth: 1,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
    },
    activityEmptyText: {
      ...typography.body,
      textAlign: 'center',
    },
    feedItemSpacing: {
      marginTop: spacing.md,
    },
    sectionTitle: {
      ...typography.heading3,
      marginBottom: spacing.md,
    },
    statsGrid: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    statCard: {
      flex: 1,
      borderRadius: borderRadius.lg,
      padding: spacing.md,
      alignItems: 'center',
      gap: spacing.xs,
    },
    statValue: {
      ...typography.heading3,
    },
    statLabel: {
      ...typography.small,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
  });
