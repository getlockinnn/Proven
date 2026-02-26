import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, colors, spacing, typography } from '../../constants/theme';
import { Challenge } from '../../services/challengeService';

interface StatusPillProps {
  status: Challenge['status'] | 'pending' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'missed';
}

export function StatusPill({ status }: StatusPillProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'free':
        return { label: 'Free', color: colors.statusFree, textColor: '#FFFFFF' };
      case 'active':
        return { label: 'Active', color: colors.statusActive, textColor: '#FFFFFF' };
      case 'completed':
        return { label: 'Completed', color: colors.statusCompleted, textColor: colors.provenDark };
      case 'upcoming':
        return { label: 'Upcoming', color: colors.warning, textColor: '#FFFFFF' };
      case 'pending':
        return { label: 'Not Submitted', color: colors.error, textColor: '#FFFFFF' };
      case 'submitted':
        return { label: 'Submitted', color: colors.provenGreen, textColor: '#FFFFFF' };
      case 'under_review':
        return { label: 'Under Review', color: '#F59E0B', textColor: '#FFFFFF' }; // Neutral Amber
      case 'approved':
        return { label: 'Approved', color: '#568B5B', textColor: '#FFFFFF' }; // Muted Green
      case 'rejected':
        return { label: 'Rejected', color: '#D65D5D', textColor: '#FFFFFF' }; // Soft Red
      case 'missed':
        return { label: 'Missed', color: '#9CA3AF', textColor: '#FFFFFF' }; // Neutral Gray
      default:
        return { label: status, color: colors.warmGray, textColor: colors.provenDark };
    }
  };

  const config = getStatusConfig();

  return (
    <View style={[styles.statusPill, { backgroundColor: config.color }]}>
      <Text style={[styles.statusPillText, { color: config.textColor }]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusPillText: {
    ...typography.small,
    fontWeight: '700',
  },
});

