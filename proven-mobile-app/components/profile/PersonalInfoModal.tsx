import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/theme';

interface PersonalInfoModalProps {
  visible: boolean;
  onClose: () => void;
  name: string;
  email: string;
  username: string;
}

export function PersonalInfoModal({ 
  visible, 
  onClose, 
  name,
  email,
  username 
}: PersonalInfoModalProps) {
  const insets = useSafeAreaInsets();
  
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
          <View style={styles.headerButton} />
          <Text style={styles.headerTitle}>Personal Info</Text>
          <Pressable onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={colors.provenDark} />
          </Pressable>
        </View>
        
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Info Card */}
          <View style={styles.infoCard}>
            <InfoRow 
              icon="person-outline" 
              label="Display Name" 
              value={name} 
            />
            <InfoRow 
              icon="at-outline" 
              label="Username" 
              value={`@${username}`} 
            />
            <InfoRow 
              icon="mail-outline" 
              label="Email" 
              value={email}
              isLast 
            />
          </View>
          
          {/* Account Info */}
          <Text style={styles.sectionTitle}>Account Details</Text>
          <View style={styles.infoCard}>
            <InfoRow 
              icon="calendar-outline" 
              label="Member Since" 
              value="January 2024" 
            />
            <InfoRow 
              icon="shield-checkmark-outline" 
              label="Account Status" 
              value="Verified"
              valueColor={colors.success}
              isLast 
            />
          </View>
          
          {/* Note */}
          <View style={styles.noteBox}>
            <Ionicons name="information-circle-outline" size={20} color={colors.info} />
            <Text style={styles.noteText}>
              To change your email address, please contact support. Your username cannot be changed.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

interface InfoRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  valueColor?: string;
  isLast?: boolean;
}

function InfoRow({ icon, label, value, valueColor, isLast }: InfoRowProps) {
  return (
    <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
      <View style={styles.infoRowLeft}>
        <View style={styles.iconContainer}>
          <Ionicons name={icon} size={20} color={colors.provenGreen} />
        </View>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, valueColor && { color: valueColor }]}>
        {value}
      </Text>
    </View>
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
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.heading3,
    color: colors.provenDark,
  },
  scrollView: {
    flex: 1,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
  },
  infoCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: `${colors.provenGreen}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.bodyBold,
    color: colors.provenDark,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: `${colors.info}10`,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.xl,
  },
  noteText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
});

