import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

interface ProfileHeaderProps {
  name: string;
  username: string;
  profileImage: string;
  onImageChange: (uri: string) => void;
  onEditProfile: () => void;
  followerCount?: number;
  followingCount?: number;
  onFollowersPress?: () => void;
  onFollowingPress?: () => void;
}

export function ProfileHeader({
  name,
  username,
  profileImage,
  onImageChange,
  onEditProfile,
  followerCount = 0,
  followingCount = 0,
  onFollowersPress,
  onFollowingPress,
}: ProfileHeaderProps) {
  const { colors } = useTheme();

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(
        'Photo Access Needed',
        'To change your profile picture, we need access to your photos. Please enable this in your device settings.',
        [{ text: 'Got it' }]
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      onImageChange(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(
        'Camera Access Needed',
        'To take a profile picture, we need access to your camera. Please enable this in your device settings.',
        [{ text: 'Got it' }]
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      onImageChange(result.assets[0].uri);
    }
  };

  const handleImagePress = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            takePhoto();
          } else if (buttonIndex === 2) {
            pickImage();
          }
        }
      );
    } else {
      Alert.alert(
        'Change Profile Picture',
        'Choose an option',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Take Photo', onPress: takePhoto },
          { text: 'Choose from Library', onPress: pickImage },
        ]
      );
    }
  };

  return (
    <Animated.View
      entering={FadeIn.duration(500)}
      style={styles.profileHeader}
    >
      <Pressable style={styles.profileImageContainer} onPress={handleImagePress}>
        <Image
          source={{ uri: profileImage }}
          style={[styles.profileImage, { borderColor: colors.provenGreen }]}
          transition={200}
          cachePolicy="disk"
        />
        <View style={[styles.editImageButton, { backgroundColor: colors.provenGreen, borderColor: colors.background }]}>
          <Ionicons name="camera" size={16} color="#FFFFFF" />
        </View>
      </Pressable>

      <Text style={[styles.profileName, { color: colors.textPrimary }]}>{name}</Text>
      <Text style={[styles.profileUsername, { color: colors.textMuted }]}>@{username}</Text>
      <View style={styles.socialCountsRow}>
        <Pressable onPress={onFollowersPress} style={styles.socialCountTap} hitSlop={6}>
          <Text style={[styles.socialCountNumber, { color: colors.textPrimary }]}>
            {followerCount}
          </Text>
          <Text style={[styles.socialCountLabel, { color: colors.textMuted }]}>
            {' '}followers
          </Text>
        </Pressable>
        <Text style={[styles.socialCountDot, { color: colors.textMuted }]}> · </Text>
        <Pressable onPress={onFollowingPress} style={styles.socialCountTap} hitSlop={6}>
          <Text style={[styles.socialCountNumber, { color: colors.textPrimary }]}>
            {followingCount}
          </Text>
          <Text style={[styles.socialCountLabel, { color: colors.textMuted }]}>
            {' '}following
          </Text>
        </Pressable>
      </View>

      <Pressable style={[styles.editProfileButton, { backgroundColor: `${colors.provenGreen}15` }]} onPress={onEditProfile}>
        <Ionicons name="pencil" size={16} color={colors.provenGreen} />
        <Text style={[styles.editProfileText, { color: colors.provenGreen }]}>Edit Profile</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  profileHeader: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  profileImageContainer: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.full,
    borderWidth: 4,
  },
  editImageButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
  },
  profileName: {
    ...typography.heading1,
    marginBottom: 4,
  },
  profileUsername: {
    ...typography.body,
    marginBottom: spacing.sm,
  },
  socialCountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  socialCountTap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  socialCountNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  socialCountLabel: {
    fontSize: 14,
    fontWeight: '400',
  },
  socialCountDot: {
    fontSize: 14,
  },
  editProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  editProfileText: {
    ...typography.bodyBold,
  },
});
