import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useTapestry } from '../../context/TapestryContext';
import { getCurrentUser, updateUserProfile, uploadProfileImage, User } from '../../services/userService';
import { FollowListModal } from '../../components/social';

// Components
import {
  AppearanceModal,
  EditProfileModal,
  MenuItem,
  MenuSection,
  NotificationSettingsModal,
  PersonalInfoModal,
  ProfileHeader,
  StatsCard,
  SupportModal,
  TransactionHistoryModal,
  WalletAddressModal,
} from '../../components/profile';

type SupportType = 'help' | 'contact' | 'terms' | 'privacy';

// Default user for when not logged in or loading
const defaultUser: User = {
  id: '',
  name: 'User',
  username: 'user',
  email: '',
  profilePicture: `${process.env.EXPO_PUBLIC_DEFAULT_AVATAR_BASE_URL}default`,
  walletAddress: null,
  walletBalance: 0,
  streak: 0,
  proofsSubmitted: 0,
  challengesCompleted: 0,
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { signOut, isAuthenticated, loading: authLoading } = useAuth();
  const { colors, shadows, themeMode } = useTheme();
  const { followerCount, followingCount, tapestryProfileId } = useTapestry();

  // User state
  const [user, setUser] = useState<User>(defaultUser);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  // Modal states
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [personalInfoVisible, setPersonalInfoVisible] = useState(false);
  const [transactionHistoryVisible, setTransactionHistoryVisible] = useState(false);
  const [appearanceVisible, setAppearanceVisible] = useState(false);
  const [notificationSettingsVisible, setNotificationSettingsVisible] = useState(false);
  const [supportModalVisible, setSupportModalVisible] = useState(false);
  const [supportModalType, setSupportModalType] = useState<SupportType>('help');
  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [followListVisible, setFollowListVisible] = useState(false);
  const [followListType, setFollowListType] = useState<'followers' | 'following'>('followers');

  const loadUserProfile = useCallback(async () => {
    try {
      setLoading(true);
      const userData = await getCurrentUser();
      if (userData) {
        setUser(userData);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      setUser(defaultUser);
      setLoading(false);
      return;
    }

    loadUserProfile();
  }, [authLoading, isAuthenticated, loadUserProfile]);

  const getAppearanceLabel = () => {
    switch (themeMode) {
      case 'light': return 'Light';
      case 'dark': return 'Dark';
      case 'system': return 'System';
    }
  };

  // Create dynamic styles based on theme
  const styles = createStyles(colors);

  const openSupportModal = (type: SupportType) => {
    setSupportModalType(type);
    setSupportModalVisible(true);
  };

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await signOut();
      // Navigation is handled by AuthProvider route protection.
    } finally {
      setLoggingOut(false);
    }
  };

  const handleNameSave = async (newName: string) => {
    // Update local state immediately for responsiveness
    setUser(prev => ({ ...prev, name: newName }));

    // Persist to backend
    try {
      await updateUserProfile({ preferredName: newName });
    } catch (error) {
      console.error('Error saving profile:', error);
      // Optionally revert on error
    }
  };

  const handleImageChange = async (newImage: string) => {
    // Update local state immediately for responsiveness
    setUser(prev => ({ ...prev, profilePicture: newImage }));

    // Persist to backend
    try {
      const uploadedUrl = await uploadProfileImage(newImage);
      if (!uploadedUrl) {
        throw new Error('Unable to upload profile image');
      }

      setUser(prev => ({ ...prev, profilePicture: uploadedUrl }));
      await updateUserProfile({ image: uploadedUrl });
    } catch (error) {
      console.error('Error saving profile image:', error);
      // Reload the authoritative profile so we don't keep a device-local file URI.
      await loadUserProfile();
    }
  };

  if (loading || loggingOut) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={colors.provenGreen} />
        {loggingOut ? (
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>Logging out...</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ProfileHeader
          name={user.name}
          username={user.username}
          profileImage={user.profilePicture}
          onImageChange={handleImageChange}
          onEditProfile={() => setEditProfileVisible(true)}
          followerCount={followerCount}
          followingCount={followingCount}
          onFollowersPress={() => {
            setFollowListType('followers');
            setFollowListVisible(true);
          }}
          onFollowingPress={() => {
            setFollowListType('following');
            setFollowListVisible(true);
          }}
        />

        {/* Wallet Balance Card */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(100)}
        >
          <Pressable
            style={[styles.walletCard, { backgroundColor: colors.provenGreen }, shadows.md]}
            onPress={() => setWalletModalVisible(true)}
          >
            <View style={styles.walletHeader}>
              <View style={styles.walletHeaderLeft}>
                <Ionicons name="wallet" size={24} color="#FFFFFF" />
                <Text style={styles.walletLabel}>Wallet Balance</Text>
              </View>
              <View style={styles.walletAddressBadge}>
                <Text style={styles.walletAddressText}>
                  {user.walletAddress ? `${user.walletAddress.slice(0, 4)}...${user.walletAddress.slice(-4)}` : 'Set Wallet'}
                </Text>
                <Ionicons name="pencil" size={12} color="#FFFFFF" />
              </View>
            </View>
            <Text style={styles.walletBalance}>${user.walletBalance.toFixed(2)}</Text>
            <Text style={styles.walletSubtext}>USDC</Text>
          </Pressable>
        </Animated.View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <StatsCard
            icon="flame"
            value={user.proofsSubmitted}
            label="Proofs"
            color={colors.warning}
            index={0}
          />
          <StatsCard
            icon="trophy"
            value={user.challengesCompleted}
            label="Completed"
            color={colors.provenGreen}
            index={1}
          />
        </View>

        {/* Menu Sections */}
        <MenuSection title="Account" delay={300}>
          <MenuItem
            icon="person-outline"
            label="Personal Info"
            onPress={() => setPersonalInfoVisible(true)}
          />
          <MenuItem
            icon="receipt-outline"
            label="Transaction History"
            onPress={() => setTransactionHistoryVisible(true)}
          />
          <MenuItem
            icon="shield-checkmark-outline"
            label="Privacy & Security"
            onPress={() => openSupportModal('privacy')}
            isLast
          />
        </MenuSection>

        <MenuSection title="Preferences" delay={400}>
          <MenuItem
            icon="notifications-outline"
            label="Notifications"
            onPress={() => setNotificationSettingsVisible(true)}
          />
          <MenuItem
            icon="moon-outline"
            label="Appearance"
            value={getAppearanceLabel()}
            onPress={() => setAppearanceVisible(true)}
            isLast
          />
        </MenuSection>

        <MenuSection title="Support" delay={500}>
          <MenuItem
            icon="help-circle-outline"
            label="Help Center"
            onPress={() => openSupportModal('help')}
          />
          <MenuItem
            icon="chatbubble-outline"
            label="Contact Us"
            onPress={() => openSupportModal('contact')}
          />
          <MenuItem
            icon="document-text-outline"
            label="Terms & Conditions"
            onPress={() => openSupportModal('terms')}
          />
          <MenuItem
            icon="lock-closed-outline"
            label="Privacy Policy"
            onPress={() => openSupportModal('privacy')}
            isLast
          />
        </MenuSection>

        {/* Logout Button */}
        <Animated.View entering={FadeInDown.duration(400).delay(600)}>
          <Pressable style={styles.logoutButton} onPress={handleLogout} disabled={loggingOut}>
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={styles.logoutText}>{loggingOut ? 'Logging out...' : 'Log Out'}</Text>
          </Pressable>
        </Animated.View>

        {/* App Version */}
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </ScrollView>

      {/* Modals */}
      <EditProfileModal
        visible={editProfileVisible}
        onClose={() => setEditProfileVisible(false)}
        currentName={user.name}
        onSave={handleNameSave}
      />

      <PersonalInfoModal
        visible={personalInfoVisible}
        onClose={() => setPersonalInfoVisible(false)}
        name={user.name}
        email={user.email || `${user.username}@provenapp.com`}
        username={user.username}
      />

      <TransactionHistoryModal
        visible={transactionHistoryVisible}
        onClose={() => setTransactionHistoryVisible(false)}
      />

      <AppearanceModal
        visible={appearanceVisible}
        onClose={() => setAppearanceVisible(false)}
      />

      <NotificationSettingsModal
        visible={notificationSettingsVisible}
        onClose={() => setNotificationSettingsVisible(false)}
      />

      <SupportModal
        visible={supportModalVisible}
        onClose={() => setSupportModalVisible(false)}
        type={supportModalType}
      />

      <WalletAddressModal
        visible={walletModalVisible}
        onClose={() => setWalletModalVisible(false)}
        currentAddress={user.walletAddress}
        onSaved={(address) => setUser(prev => ({ ...prev, walletAddress: address }))}
      />

      {tapestryProfileId ? (
        <FollowListModal
          visible={followListVisible}
          onClose={() => setFollowListVisible(false)}
          profileId={tapestryProfileId}
          type={followListType}
        />
      ) : null}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
  },
  walletCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  walletHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  walletAddressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 9999, // Ensure it's fully rounded
    gap: 4,
  },
  walletAddressText: {
    ...typography.small,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  walletLabel: {
    ...typography.body,
    color: 'rgba(255,255,255,0.8)',
  },
  walletBalance: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  walletSubtext: {
    ...typography.small,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: `${colors.error}10`,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
  },
  logoutText: {
    ...typography.bodyBold,
    color: colors.error,
  },
  versionText: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.sm,
  },
});
