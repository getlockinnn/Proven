import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { ThemeMode, useTheme } from '../../context/ThemeContext';

interface AppearanceModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AppearanceModal({
  visible,
  onClose,
}: AppearanceModalProps) {
  const insets = useSafeAreaInsets();
  const { themeMode, setThemeMode, colors, shadows } = useTheme();

  const options: { mode: ThemeMode; icon: keyof typeof Ionicons.glyphMap; label: string; description: string }[] = [
    {
      mode: 'light',
      icon: 'sunny',
      label: 'Light',
      description: 'Always use light mode',
    },
    {
      mode: 'dark',
      icon: 'moon',
      label: 'Dark',
      description: 'Always use dark mode',
    },
    {
      mode: 'system',
      icon: 'phone-portrait',
      label: 'System',
      description: 'Match your device settings',
    },
  ];

  const styles = createStyles(colors, shadows);

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
          <Text style={styles.headerTitle}>Appearance</Text>
          <Pressable onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={colors.provenDark} />
          </Pressable>
        </View>

        {/* Options */}
        <View style={styles.optionsList}>
          {options.map((option, index) => (
            <Pressable
              key={option.mode}
              style={[
                styles.optionItem,
                index !== options.length - 1 && styles.optionBorder,
                themeMode === option.mode && styles.optionSelected,
              ]}
              onPress={() => {
                setThemeMode(option.mode);
                onClose();
              }}
            >
              <View style={[
                styles.optionIcon,
                themeMode === option.mode && styles.optionIconSelected,
              ]}>
                <Ionicons
                  name={option.icon}
                  size={22}
                  color={themeMode === option.mode ? colors.provenGreen : colors.textSecondary}
                />
              </View>
              <View style={styles.optionInfo}>
                <Text style={[
                  styles.optionLabel,
                  themeMode === option.mode && styles.optionLabelSelected,
                ]}>
                  {option.label}
                </Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              {themeMode === option.mode && (
                <Ionicons name="checkmark-circle" size={24} color={colors.provenGreen} />
              )}
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any, shadows: any) => StyleSheet.create({
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
  optionsList: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  optionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionSelected: {
    backgroundColor: `${colors.provenGreen}08`,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: `${colors.textMuted}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionIconSelected: {
    backgroundColor: `${colors.provenGreen}15`,
  },
  optionInfo: {
    flex: 1,
  },
  optionLabel: {
    ...typography.bodyBold,
    color: colors.provenDark,
  },
  optionLabelSelected: {
    color: colors.provenGreen,
  },
  optionDescription: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});


