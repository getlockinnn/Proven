import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/theme';

interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
  currentName: string;
  onSave: (name: string) => void;
}

export function EditProfileModal({ 
  visible, 
  onClose, 
  currentName, 
  onSave 
}: EditProfileModalProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(currentName);
  
  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim());
      onClose();
    }
  };
  
  const handleClose = () => {
    setName(currentName);
    onClose();
  };
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={[styles.content, { paddingTop: insets.top || spacing.lg }]}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={handleClose} style={styles.headerButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Edit Profile</Text>
            <Pressable onPress={handleSave} style={styles.headerButton}>
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
          
          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Display Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter your name"
                placeholderTextColor={colors.textMuted}
                autoFocus
                maxLength={30}
              />
              <Text style={styles.charCount}>{name.length}/30</Text>
            </View>
            
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={20} color={colors.info} />
              <Text style={styles.infoText}>
                Your display name will be visible to other users on the leaderboard and in challenges.
              </Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  headerTitle: {
    ...typography.heading3,
    color: colors.provenDark,
  },
  cancelText: {
    ...typography.body,
    color: colors.textMuted,
  },
  saveText: {
    ...typography.bodyBold,
    color: colors.provenGreen,
  },
  form: {
    gap: spacing.xl,
  },
  inputGroup: {
    gap: spacing.sm,
  },
  inputLabel: {
    ...typography.bodyBold,
    color: colors.provenDark,
  },
  input: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...typography.body,
    color: colors.provenDark,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  charCount: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'right',
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

