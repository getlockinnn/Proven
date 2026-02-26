import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { FollowButton } from './FollowButton';
import {
  getFollowers,
  getFollowing,
  TapestryFollowProfile,
} from '../../services/tapestryService';

const DEFAULT_AVATAR_BASE =
  process.env.EXPO_PUBLIC_DEFAULT_AVATAR_BASE_URL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=';

const PAGE_SIZE = 20;

interface FollowListModalProps {
  visible: boolean;
  onClose: () => void;
  profileId: string;
  type: 'followers' | 'following';
}

export function FollowListModal({ visible, onClose, profileId, type }: FollowListModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [profiles, setProfiles] = useState<TapestryFollowProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchData = useCallback(async (pageNum: number, append: boolean) => {
    try {
      const fetcher = type === 'followers' ? getFollowers : getFollowing;
      const result = await fetcher(profileId, pageNum, PAGE_SIZE);
      const newProfiles = result.profiles;

      if (append) {
        setProfiles((prev) => [...prev, ...newProfiles]);
      } else {
        setProfiles(newProfiles);
      }
      setHasMore(newProfiles.length === PAGE_SIZE);
      setPage(pageNum);
    } catch (error) {
      console.error(`[FollowListModal] Error fetching ${type}:`, error);
    }
  }, [profileId, type]);

  useEffect(() => {
    if (!visible || !profileId) return;
    setLoading(true);
    setProfiles([]);
    setPage(1);
    setHasMore(true);
    fetchData(1, false).finally(() => setLoading(false));
  }, [visible, profileId, type, fetchData]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchData(page + 1, true);
    setLoadingMore(false);
  }, [loadingMore, hasMore, page, fetchData]);

  const handleProfilePress = (id: string) => {
    onClose();
    setTimeout(() => {
      router.push(`/user/${id}`);
    }, 300);
  };

  const renderItem = ({ item }: { item: TapestryFollowProfile }) => {
    const avatar = item.image || `${DEFAULT_AVATAR_BASE}${item.id}`;
    const name = item.bio || item.username || 'User';

    return (
      <Pressable
        style={[styles.row, { backgroundColor: colors.cardBackground }]}
        onPress={() => handleProfilePress(item.id)}
      >
        <Image source={{ uri: avatar }} style={styles.avatar} transition={200} cachePolicy="disk" />
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>
            @{item.username || item.id.slice(0, 8)}
          </Text>
        </View>
        <FollowButton profileId={item.id} size="sm" />
      </Pressable>
    );
  };

  const title = type === 'followers' ? 'Followers' : 'Following';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.provenGreen} />
          </View>
        ) : profiles.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name={type === 'followers' ? 'people-outline' : 'person-add-outline'}
              size={48}
              color={colors.textMuted}
            />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              {type === 'followers'
                ? 'When people follow you, they\'ll show up here.'
                : 'Follow people from the leaderboard to see them here.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={profiles}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator size="small" color={colors.provenGreen} style={styles.footer} />
              ) : null
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: undefined, // set dynamically via style prop
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.heading3,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
  },
  info: {
    flex: 1,
  },
  name: {
    ...typography.body,
    fontWeight: '600',
  },
  handle: {
    ...typography.small,
    marginTop: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.heading3,
    marginTop: spacing.md,
  },
  emptySubtitle: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: {
    paddingVertical: spacing.lg,
  },
});
