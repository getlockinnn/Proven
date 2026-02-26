import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useTapestry } from '../../context/TapestryContext';
import {
  CommentData,
  deleteComment,
  getComments,
  postComment,
} from '../../services/tapestryService';

const DEFAULT_AVATAR_BASE =
  process.env.EXPO_PUBLIC_DEFAULT_AVATAR_BASE_URL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=';

interface CommentSectionProps {
  visible: boolean;
  onClose: () => void;
  contentId: string;
  onCommentCountChange?: (delta: number) => void;
}

function formatCommentTime(timestamp: number): string {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return new Date(timestamp).toLocaleDateString();
}

export function CommentSection({ visible, onClose, contentId, onCommentCountChange }: CommentSectionProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tapestryProfileId, tapestryProfile } = useTapestry();
  const inputRef = useRef<TextInput>(null);

  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [text, setText] = useState('');

  const loadComments = useCallback(async () => {
    if (!contentId) return;
    setLoading(true);
    try {
      const result = await getComments(contentId, 1, 50);
      setComments(result.comments);
    } catch (error) {
      console.error('[CommentSection] Error loading comments:', error);
    } finally {
      setLoading(false);
    }
  }, [contentId]);

  useEffect(() => {
    if (visible && contentId) {
      void loadComments();
    }
    if (!visible) {
      setComments([]);
      setText('');
    }
  }, [visible, contentId, loadComments]);

  const handlePost = useCallback(async () => {
    if (!tapestryProfileId || !contentId || !text.trim() || posting) return;

    setPosting(true);
    try {
      const result = await postComment(contentId, tapestryProfileId, text.trim());
      if (result) {
        const enriched: CommentData = {
          ...result,
          authorId: tapestryProfileId,
          authorUsername: tapestryProfile?.profile.username || '',
          authorName: tapestryProfile?.profile.bio || tapestryProfile?.profile.username || 'You',
          authorAvatar: tapestryProfile?.profile.image || undefined,
        };
        setComments((prev) => [enriched, ...prev]);
        onCommentCountChange?.(1);
      }
      setText('');
      Keyboard.dismiss();
    } catch (error) {
      console.error('[CommentSection] Error posting comment:', error);
    } finally {
      setPosting(false);
    }
  }, [tapestryProfileId, tapestryProfile, contentId, text, posting, onCommentCountChange]);

  const handleDelete = useCallback(async (commentId: string) => {
    try {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      onCommentCountChange?.(-1);
      await deleteComment(commentId);
    } catch (error) {
      console.error('[CommentSection] Error deleting comment:', error);
      void loadComments();
    }
  }, [loadComments, onCommentCountChange]);

  const handleProfilePress = (profileId: string) => {
    if (!profileId || profileId.startsWith('mock-')) return;
    onClose();
    setTimeout(() => router.push(`/user/${profileId}`), 300);
  };

  const renderComment = ({ item }: { item: CommentData }) => {
    const avatar = item.authorAvatar || `${DEFAULT_AVATAR_BASE}${item.authorId || 'user'}`;
    const isOwn = tapestryProfileId === item.authorId;

    return (
      <View style={styles.commentRow}>
        <Pressable onPress={() => handleProfilePress(item.authorId)}>
          <Image source={{ uri: avatar }} style={styles.commentAvatar} transition={100} cachePolicy="disk" />
        </Pressable>
        <View style={styles.commentBody}>
          <Text style={[styles.commentText, { color: colors.textPrimary }]}>
            <Text
              style={styles.commentAuthor}
              onPress={() => handleProfilePress(item.authorId)}
            >
              {item.authorName || item.authorUsername || 'User'}{' '}
            </Text>
            {item.text}
          </Text>
          <View style={styles.commentMeta}>
            <Text style={[styles.commentTime, { color: colors.textMuted }]}>
              {formatCommentTime(item.createdAt)}
            </Text>
            {isOwn && (
              <Pressable onPress={() => handleDelete(item.id)} hitSlop={8}>
                <Text style={[styles.deleteText, { color: colors.textMuted }]}>Delete</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  };

  const myAvatar = tapestryProfile?.profile.image || `${DEFAULT_AVATAR_BASE}${tapestryProfileId || 'me'}`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.dragHandle} />
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Comments</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* Comments List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.provenGreen} />
          </View>
        ) : comments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubble-outline" size={40} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No comments yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Be the first to encourage!
            </Text>
          </View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={(item) => item.id}
            renderItem={renderComment}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Input */}
        {tapestryProfileId && (
          <View style={[styles.inputContainer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Image source={{ uri: myAvatar }} style={styles.inputAvatar} transition={100} cachePolicy="disk" />
            <TextInput
              ref={inputRef}
              style={[styles.input, { backgroundColor: colors.warmGray, color: colors.textPrimary }]}
              placeholder="Add a comment..."
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={handlePost}
              blurOnSubmit
            />
            <Pressable
              onPress={handlePost}
              disabled={!text.trim() || posting}
              hitSlop={8}
              style={[styles.sendButton, (!text.trim() || posting) && { opacity: 0.4 }]}
            >
              {posting ? (
                <ActivityIndicator size="small" color={colors.provenGreen} />
              ) : (
                <Ionicons name="send" size={20} color={colors.provenGreen} />
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C0C0C0',
    marginBottom: spacing.sm,
  },
  headerTitle: {
    ...typography.heading3,
  },
  closeButton: {
    position: 'absolute',
    right: spacing.lg,
    top: spacing.md,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: spacing.xs,
  },
  emptyTitle: {
    ...typography.bodyBold,
    marginTop: spacing.sm,
  },
  emptySubtitle: {
    ...typography.small,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  commentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    marginTop: 2,
  },
  commentBody: {
    flex: 1,
  },
  commentText: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
  },
  commentAuthor: {
    fontWeight: '700',
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: 4,
  },
  commentTime: {
    ...typography.small,
    fontSize: 11,
  },
  deleteText: {
    ...typography.small,
    fontSize: 11,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  inputAvatar: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
  },
  input: {
    flex: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    maxHeight: 80,
    fontSize: 14,
  },
  sendButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
