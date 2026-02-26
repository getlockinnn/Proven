/**
 * Wallet Connect Modal
 * Modal for connecting Solana wallets using Phantom Embedded SDK
 * Supports Google and Apple sign-in for wallet creation
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { useWallet } from '../../hooks/useWallet';

interface WalletConnectModalProps {
  visible: boolean;
  onClose: () => void;
}

export function WalletConnectModal({ visible, onClose }: WalletConnectModalProps) {
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const {
    connectWithGoogle,
    connectWithApple,
    connecting,
    connected,
    truncatedAddress,
    disconnect,
  } = useWallet();

  const [connectingProvider, setConnectingProvider] = useState<'google' | 'apple' | null>(null);

  const handleConnectGoogle = async () => {
    setConnectingProvider('google');
    try {
      await connectWithGoogle();
      onClose();
    } catch (error) {
      console.error('Google connection failed:', error);
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleConnectApple = async () => {
    setConnectingProvider('apple');
    try {
      await connectWithApple();
      onClose();
    } catch (error) {
      console.error('Apple connection failed:', error);
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    onClose();
  };

  const isConnecting = connecting || connectingProvider !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Animated.View
        style={styles.backdrop}
      >
        <Pressable style={styles.backdropPressable} onPress={onClose} />
      </Animated.View>

      {/* Modal Content */}
      <Animated.View
        style={[styles.modalContainer, { backgroundColor: colors.cardBackground, paddingBottom: insets.bottom + spacing.lg }, shadows.lg]}
      >
        {/* Handle Bar */}
        <View style={[styles.handleBar, { backgroundColor: colors.warmGray }]} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {connected ? 'Wallet Connected' : 'Connect Wallet'}
          </Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>

        {connected ? (
          // Connected State
          <View style={styles.connectedContainer}>
            <View style={styles.connectedBadge}>
              <Ionicons name="checkmark-circle" size={48} color={colors.provenGreen} />
            </View>
            <Text style={[styles.connectedLabel, { color: colors.provenGreen }]}>Connected</Text>
            <Text style={[styles.addressText, { color: colors.textPrimary }]}>{truncatedAddress}</Text>

            <Pressable style={[styles.disconnectButton, { borderColor: colors.error }]} onPress={handleDisconnect}>
              <Text style={[styles.disconnectButtonText, { color: colors.error }]}>Disconnect</Text>
            </Pressable>
          </View>
        ) : (
          // Connect State
          <View style={styles.walletsContainer}>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Sign in to create your Solana wallet and start staking in challenges.
            </Text>

            {/* Google Sign In */}
            <Pressable
              style={[styles.authButton, styles.googleButton, { borderColor: colors.warmGray }, shadows.sm]}
              onPress={handleConnectGoogle}
              disabled={isConnecting}
            >
              <View style={styles.authIconContainer}>
                <Ionicons name="logo-google" size={24} color="#DB4437" />
              </View>
              <Text style={[styles.authButtonText, { color: colors.textPrimary }]}>Continue with Google</Text>
              {connectingProvider === 'google' ? (
                <ActivityIndicator color={colors.textPrimary} size="small" />
              ) : (
                <View style={{ width: 20 }} />
              )}
            </Pressable>

            {/* Apple Sign In - only show on iOS */}
            {Platform.OS === 'ios' && (
              <Pressable
                style={[styles.authButton, styles.appleButton, shadows.sm]}
                onPress={handleConnectApple}
                disabled={isConnecting}
              >
                <View style={styles.authIconContainer}>
                  <Ionicons name="logo-apple" size={24} color="#FFFFFF" />
                </View>
                <Text style={[styles.authButtonText, styles.appleButtonText]}>
                  Continue with Apple
                </Text>
                {connectingProvider === 'apple' ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <View style={{ width: 20 }} />
                )}
              </Pressable>
            )}

            {/* Info */}
            <View style={[styles.infoContainer, { backgroundColor: colors.warmGray }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.provenGreen} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                {"Your wallet is secured by Phantom. You'll set a PIN to protect your funds."}
              </Text>
            </View>

            {/* Powered by Phantom */}
            <View style={styles.poweredBy}>
              <Text style={[styles.poweredByText, { color: colors.textSecondary }]}>Powered by</Text>
              <View style={[styles.phantomBadge, { backgroundColor: colors.warmGray }]}>
                <Ionicons name="wallet" size={16} color={colors.textPrimary} />
                <Text style={[styles.phantomText, { color: colors.textPrimary }]}>Phantom</Text>
              </View>
            </View>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdropPressable: {
    flex: 1,
  },
  modalContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.heading2,
  },
  closeButton: {
    padding: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  walletsContainer: {
    paddingBottom: spacing.md,
  },
  authButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
  },
  appleButton: {
    backgroundColor: '#000000',
  },
  authIconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  authButtonText: {
    flex: 1,
    ...typography.bodyBold,
  },
  appleButtonText: {
    color: '#FFFFFF',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  infoText: {
    flex: 1,
    ...typography.caption,
    lineHeight: 18,
  },
  poweredBy: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  poweredByText: {
    ...typography.caption,
  },
  phantomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  phantomText: {
    ...typography.caption,
    fontWeight: '600',
  },
  connectedContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  connectedBadge: {
    marginBottom: spacing.md,
  },
  connectedLabel: {
    ...typography.bodyBold,
    marginBottom: spacing.xs,
  },
  addressText: {
    ...typography.heading3,
    marginBottom: spacing.xl,
  },
  disconnectButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  disconnectButtonText: {
    ...typography.bodyBold,
  },
});
