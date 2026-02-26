import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { ProofEvent } from '../../services/tapestryService';
import { CircularProgress } from '../ui/CircularProgress';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DEFAULT_AVATAR_BASE =
  process.env.EXPO_PUBLIC_DEFAULT_AVATAR_BASE_URL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=';

interface FeedCardProps {
  event: ProofEvent;
  onToggleLike?: (eventId: string, hasLiked: boolean) => void;
  onPressAuthor?: (profileId: string) => void;
  onPressChallenge?: (challengeId: string) => void;
  onPressComment?: (eventId: string) => void;
  disableActions?: boolean;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = Math.max(0, now - timestamp);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return new Date(timestamp).toLocaleDateString();
}

export function FeedCard({
  event,
  onToggleLike,
  onPressAuthor,
  onPressChallenge,
  onPressComment,
  disableActions = false,
}: FeedCardProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const avatarUri = event.authorAvatar || `${DEFAULT_AVATAR_BASE}${event.profileId || 'user'}`;
  const authorName = event.authorName || event.authorUsername || 'User';
  const handle = event.authorUsername ? `@${event.authorUsername}` : null;
  // Only use proof image if it's a valid URL; otherwise fallback to placeholder
  const hasValidImage = event.proofImageUrl && event.proofImageUrl.startsWith('http');
  const imageUrl = hasValidImage ? event.proofImageUrl : 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=1000&auto=format&fit=crop';

  const hasPayout = typeof event.earnedAmount === 'number' && event.earnedAmount > 0;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.authorSection}
          onPress={() => (event.profileId ? onPressAuthor?.(event.profileId) : undefined)}
        >
          <Image source={{ uri: avatarUri }} style={styles.avatar} transition={150} cachePolicy="disk" />
          <View style={styles.authorInfo}>
            <Text style={styles.authorName} numberOfLines={1}>
              {authorName}
            </Text>
            {handle ? (
              <Text style={styles.handle} numberOfLines={1}>
                {handle}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <View style={styles.headerRight}>
          <Text style={styles.timeText}>{formatRelativeTime(event.createdAt)}</Text>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} style={{ marginLeft: spacing.sm }} />
        </View>
      </View>

      {/* Image Content */}
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: imageUrl }}
          style={styles.postImage}
          contentFit="cover"
          transition={200}
          cachePolicy="disk"
        />

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.85)', 'rgba(0,0,0,1)']}
          locations={[0, 0.7, 1]}
          style={styles.imageOverlay}
        >
          <Pressable
            style={styles.challengeBadge}
            onPress={() => (event.challengeId ? onPressChallenge?.(event.challengeId) : undefined)}
          >
            <Ionicons name="book" size={12} color="#fff" />
            <Text style={styles.badgeText}>CHALLENGE</Text>
          </Pressable>

          <Text style={styles.challengeTitle} numberOfLines={2}>
            {event.challengeTitle}
          </Text>

          <View style={styles.metricsRow}>
            <View style={styles.metricsLeft}>
              {hasPayout && (
                <View style={styles.metricColumn}>
                  <Text style={styles.metricLabel}>PAYOUT</Text>
                  <Text style={styles.metricValue}>+${event.earnedAmount?.toFixed(2)}</Text>
                </View>
              )}
            </View>
            <View style={styles.metricsRight}>
              <CircularProgress
                percentage={(event.dayNumber / event.totalDays) * 100}
                size={44}
                strokeWidth={4}
              />
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Action Bar */}
      <View style={styles.actionBar}>
        <View style={styles.actionGroupLeft}>
          <Pressable
            style={styles.actionButton}
            onPress={() => onToggleLike?.(event.id, event.engagement.hasLiked)}
            disabled={disableActions}
          >
            <Ionicons
              name={event.engagement.hasLiked ? 'heart' : 'heart-outline'}
              size={26}
              color={event.engagement.hasLiked ? colors.error : colors.textPrimary}
            />
            {event.engagement.likes > 0 && (
              <Text style={styles.actionCount}>{event.engagement.likes}</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.actionButton}
            onPress={() => onPressComment?.(event.id)}
            disabled={disableActions}
          >
            <Ionicons name="chatbubble-outline" size={24} color={colors.textPrimary} />
            {event.engagement.comments > 0 && (
              <Text style={styles.actionCount}>{event.engagement.comments}</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Description */}
      <View style={styles.descriptionContainer}>
        <Text style={styles.descriptionText}>
          <Text style={styles.descriptionAuthor}>{authorName} </Text>
          {event.text}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    card: {
      width: SCREEN_WIDTH,
      backgroundColor: colors.background,
      marginBottom: spacing.xs,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    authorSection: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.full,
      marginRight: spacing.sm,
    },
    authorInfo: {
      justifyContent: 'center',
    },
    authorName: {
      ...typography.bodyBold,
      color: colors.textPrimary,
      fontSize: 15,
      lineHeight: 20,
    },
    handle: {
      ...typography.small,
      color: colors.textMuted,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    timeText: {
      ...typography.small,
      color: colors.textMuted,
    },
    imageContainer: {
      width: SCREEN_WIDTH - spacing.md * 2,
      height: (SCREEN_WIDTH - spacing.md * 2) * 1.3, // Taller aspect ratio
      marginHorizontal: spacing.md,
    },
    postImage: {
      width: '100%',
      height: '100%',
      borderRadius: borderRadius.xl,
    },
    actionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    actionGroupLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    actionCount: {
      ...typography.bodyBold,
      color: colors.textPrimary,
      fontSize: 14,
    },
    descriptionContainer: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.lg,
    },
    descriptionText: {
      ...typography.body,
      color: colors.textPrimary,
      lineHeight: 20,
    },
    descriptionAuthor: {
      ...typography.bodyBold,
      color: colors.textPrimary,
    },
    imageOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: spacing.lg,
      paddingTop: spacing.xl * 2,
      borderBottomLeftRadius: borderRadius.xl,
      borderBottomRightRadius: borderRadius.xl,
      justifyContent: 'flex-end',
    },
    challengeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
      alignSelf: 'flex-start',
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.15)',
      gap: 6,
    },
    badgeText: {
      ...typography.small,
      color: '#fff',
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
    },
    challengeTitle: {
      ...typography.heading2,
      color: '#fff',
      marginBottom: spacing.md,
      lineHeight: 32,
    },
    metricsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    metricsLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    metricsRight: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    metricColumn: {
      justifyContent: 'center',
    },
    metricLabel: {
      ...typography.small,
      color: 'rgba(255,255,255,0.6)',
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 1,
      marginBottom: 2,
    },
    metricValue: {
      ...typography.bodyBold,
      color: '#fff',
      fontSize: 18,
    },
  });
