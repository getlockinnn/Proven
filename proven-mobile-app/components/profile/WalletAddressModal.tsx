import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Clipboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/theme';
import { updateUserProfile } from '../../services/userService';

interface WalletAddressModalProps {
  visible: boolean;
  onClose: () => void;
  currentAddress: string | null;
  onSaved: (address: string) => void;
}

export function WalletAddressModal({
  visible,
  onClose,
  currentAddress,
  onSaved,
}: WalletAddressModalProps) {
  const insets = useSafeAreaInsets();
  const [address, setAddress] = useState(currentAddress || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setAddress(currentAddress || '');
    }
  }, [visible, currentAddress]);

  const handleSave = async () => {
    const trimmed = address.trim();
    if (!trimmed) {
      Alert.alert('Required', 'Please enter your Solana wallet address.');
      return;
    }
    if (trimmed.length < 32 || trimmed.length > 44) {
      Alert.alert('Invalid Address', 'Please enter a valid Solana wallet address (32-44 characters).');
      return;
    }

    setSaving(true);
    try {
      await updateUserProfile({ walletAddress: trimmed });
      onSaved(trimmed);
      Alert.alert('Saved', 'Wallet address updated successfully.');
      onClose();
    } catch {
      Alert.alert('Error', 'Failed to save wallet address. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getString();
      if (text) setAddress(text.trim());
    } catch {
      // Clipboard not available
    }
  };

  const truncateAddress = (addr: string) => {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top || spacing.lg }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.headerButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Wallet Address</Text>
          <Pressable
            onPress={handleSave}
            style={[styles.headerButton, saving && { opacity: 0.5 }]}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.provenGreen} />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </Pressable>
        </View>

        {/* Current wallet */}
        {currentAddress && (
          <View style={styles.currentCard}>
            <View style={styles.currentHeader}>
              <Ionicons name="wallet" size={20} color={colors.provenGreen} />
              <Text style={styles.currentLabel}>Current Wallet</Text>
            </View>
            <Text style={styles.currentAddress}>{truncateAddress(currentAddress)}</Text>
          </View>
        )}

        {/* Input */}
        <Text style={styles.inputLabel}>
          {currentAddress ? 'Update Wallet Address' : 'Add Wallet Address'}
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Paste your Solana wallet address"
            placeholderTextColor={colors.textMuted}
            value={address}
            onChangeText={setAddress}
            autoCapitalize="none"
            autoCorrect={false}
            selectTextOnFocus
          />
          <Pressable onPress={handlePaste} style={styles.pasteBtn}>
            <Ionicons name="clipboard-outline" size={18} color={colors.provenGreen} />
            <Text style={styles.pasteBtnText}>Paste</Text>
          </Pressable>
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.info} />
          <Text style={styles.infoText}>
            This is the Solana wallet address where your challenge payouts will be sent. Make sure you have access to this wallet.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xl,
  },
  headerButton: {
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.heading3,
    color: colors.provenDark,
  },
  cancelText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  saveText: {
    ...typography.bodyBold,
    color: colors.provenGreen,
  },
  currentCard: {
    backgroundColor: `${colors.provenGreen}10`,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  currentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  currentLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  currentAddress: {
    ...typography.bodyBold,
    color: colors.provenDark,
    fontFamily: 'monospace',
    marginLeft: 32,
  },
  inputLabel: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  input: {
    flex: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.provenDark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pasteBtn: {
    backgroundColor: `${colors.provenGreen}15`,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  pasteBtnText: {
    ...typography.caption,
    color: colors.provenGreen,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: `${colors.info}10`,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  infoText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
});
