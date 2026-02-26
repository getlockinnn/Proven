import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useTapestry } from '../../context/TapestryContext';

interface FollowButtonProps {
  profileId: string;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export function FollowButton({ profileId, size = 'sm', style }: FollowButtonProps) {
  const { colors } = useTheme();
  const { tapestryProfileId, isProfileLoading, isFollowing, follow, unfollow } = useTapestry();
  const [loading, setLoading] = useState(false);

  // Don't show on own profile
  if (tapestryProfileId && profileId === tapestryProfileId) {
    return null;
  }

  const isSm = size === 'sm';

  // Show loading placeholder while Tapestry profile is initializing
  if (!tapestryProfileId) {
    return (
      <View
        style={[
          styles.button,
          isSm ? styles.buttonSm : styles.buttonMd,
          { backgroundColor: colors.provenGreen, opacity: 0.5 },
          style,
        ]}
      >
        <ActivityIndicator size="small" color="#FFFFFF" />
      </View>
    );
  }

  const following = isFollowing(profileId);

  const onPress = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (following) {
        await unfollow(profileId);
      } else {
        await follow(profileId);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation();
        void onPress();
      }}
      style={[
        styles.button,
        isSm ? styles.buttonSm : styles.buttonMd,
        following
          ? {
              backgroundColor: `${colors.provenGreen}15`,
              borderColor: colors.provenGreen,
              borderWidth: 1,
            }
          : { backgroundColor: colors.provenGreen },
        style,
      ]}
      disabled={loading}
      hitSlop={8}
    >
      {following ? (
        <>
          <Ionicons name="checkmark" size={isSm ? 14 : 16} color={colors.provenGreen} />
          <Text style={[isSm ? styles.textSm : styles.textMd, { color: colors.provenGreen }]}>
            Following
          </Text>
        </>
      ) : (
        <Text style={[isSm ? styles.textSm : styles.textMd, { color: '#FFFFFF' }]}>Follow</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: borderRadius.full,
  },
  buttonSm: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    minWidth: 72,
    height: 28,
  },
  buttonMd: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    minWidth: 100,
    height: 36,
  },
  textSm: {
    fontSize: 12,
    fontWeight: '600',
  },
  textMd: {
    ...typography.caption,
    fontWeight: '600',
  },
});
