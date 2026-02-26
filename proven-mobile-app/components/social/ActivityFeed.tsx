import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../ui';
import { spacing, typography } from '../../constants/theme';
import { useTapestry } from '../../context/TapestryContext';
import { useTheme } from '../../context/ThemeContext';
import {
  getActivityFeed,
  likeContent,
  ProofEvent,
  unlikeContent,
} from '../../services/tapestryService';
import { CommentSection } from './CommentSection';
import { FeedCard } from './FeedCard';

interface ActivityFeedProps {
  active?: boolean;
  limit?: number;
}

export function ActivityFeed({ active = true, limit = 50 }: ActivityFeedProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tapestryProfileId, followingIds, isProfileLoading } = useTapestry();

  const [events, setEvents] = useState<ProofEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentContentId, setCommentContentId] = useState<string | null>(null);

  const loadFeed = useCallback(
    async (showRefreshing: boolean = false) => {
      if (!active) return;

      if (!tapestryProfileId) {
        setEvents([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        if (showRefreshing) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const feed = await getActivityFeed(tapestryProfileId, followingIds, limit);
        setEvents(feed);
      } catch (err: any) {
        setError(err?.message || 'Failed to load activity feed');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [active, followingIds, limit, tapestryProfileId]
  );

  useEffect(() => {
    if (!active) return;
    void loadFeed(false);
  }, [active, loadFeed]);

  const handleLikeToggle = useCallback(
    async (eventId: string, hasLiked: boolean) => {
      if (!tapestryProfileId) return;

      setEvents((previous) =>
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
      } catch (error) {
        setEvents((previous) =>
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
    },
    [tapestryProfileId]
  );

  const handleCommentCountChange = useCallback(
    (delta: number) => {
      if (!commentContentId) return;
      const updateFn = (previous: ProofEvent[]) =>
        previous.map((event) =>
          event.id === commentContentId
            ? {
              ...event,
              engagement: {
                ...event.engagement,
                comments: Math.max(0, event.engagement.comments + delta),
              },
            }
            : event
        );
      setEvents(updateFn);
    },
    [commentContentId]
  );

  if (isProfileLoading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.provenGreen} />
      </View>
    );
  }

  if (!tapestryProfileId) {
    return (
      <EmptyState
        icon="person-outline"
        title="Sign in to see activity"
        subtitle="Your feed appears after your profile is initialized."
      />
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon="newspaper-outline"
        title="No feed activity yet"
        subtitle="Submit a proof or follow people to populate your feed."
      />
    );
  }

  return (
    <>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FeedCard
            event={item}
            onToggleLike={handleLikeToggle}
            onPressComment={(eventId) => setCommentContentId(eventId)}
            onPressAuthor={(profileId) => router.push(`/user/${profileId}`)}
            onPressChallenge={(challengeId) => router.push(`/challenge/${challengeId}`)}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom: insets.bottom + 110,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={() => void loadFeed(true)}
      />

      <CommentSection
        visible={!!commentContentId}
        onClose={() => setCommentContentId(null)}
        contentId={commentContentId || ''}
        onCommentCountChange={handleCommentCountChange}
      />
    </>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingTop: spacing.md,
    gap: spacing.lg,
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
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
  },
});
