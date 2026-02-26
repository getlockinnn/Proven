import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';
import { borderRadius, spacing } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import { SwipeButton } from '../ui/SwipeButton';

interface ChallengeDetailCTAProps {
    isSubmittedToday: boolean;
    todayStatus: 'pending' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'missed' | undefined;
    isActiveChallenge: boolean;
    isChallengeCompleted?: boolean;
    swipeKey: number;
    insets: EdgeInsets;
    onSwipeJoin: () => void;
    onSwipeProve: () => void;
}

export function ChallengeDetailCTA({
    isSubmittedToday,
    todayStatus,
    isActiveChallenge,
    isChallengeCompleted,
    swipeKey,
    insets,
    onSwipeJoin,
    onSwipeProve,
}: ChallengeDetailCTAProps) {
    const { colors } = useTheme();

    // Logic for handling completion/done button
    const handleDone = () => {
        router.push('/(main)/challenges');
    };

    const renderSubmittedContent = () => {
        if (todayStatus === 'approved') {
            return (
                <View style={{ width: '100%', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                        style={[styles.doneButton, { backgroundColor: colors.warmGray, borderColor: colors.border }, styles.doneButtonDisabled]}
                        disabled={true}
                    >
                        <Text style={[styles.doneButtonTextDisabled, { color: colors.textMuted }]}>Done for today</Text>
                    </TouchableOpacity>
                    <Text style={[styles.habitSeedText, { color: colors.textMuted }]}>Come back tomorrow</Text>
                </View>
            );
        }

        if (todayStatus === 'rejected' || todayStatus === 'missed') {
            return (
                <TouchableOpacity
                    style={[styles.doneButton, { backgroundColor: colors.warmGray, borderColor: colors.border }]}
                    onPress={handleDone}
                >
                    <Text style={[styles.doneButtonText, { color: colors.textSecondary }]}>Continue to tomorrow</Text>
                </TouchableOpacity>
            );
        }

        // Default: Under Review
        return (
            <TouchableOpacity
                style={[styles.doneButton, { backgroundColor: colors.warmGray, borderColor: colors.border }]}
                onPress={handleDone}
            >
                <Text style={[styles.doneButtonText, { color: colors.textSecondary }]}>Done</Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.bottomContainer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + spacing.md }]}>
            {isSubmittedToday ? (
                renderSubmittedContent()
            ) : isChallengeCompleted && !isActiveChallenge ? (
                // --- COMPLETED CHALLENGE (user hasn't joined) ---
                <View style={{ width: '100%', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                        style={[styles.doneButton, { backgroundColor: colors.warmGray, borderColor: colors.border }, styles.doneButtonDisabled]}
                        disabled={true}
                    >
                        <Text style={[styles.doneButtonTextDisabled, { color: colors.textMuted }]}>Challenge Completed</Text>
                    </TouchableOpacity>
                    <Text style={[styles.habitSeedText, { color: colors.textMuted }]}>This challenge has ended</Text>
                </View>
            ) : (
                // --- PENDING/PRE-JOIN CTA ---
                <>
                    {!isActiveChallenge && (
                        <Text style={[styles.reassuranceText, { color: colors.textMuted }]}>{"You won't be charged until you join"}</Text>
                    )}
                    <SwipeButton
                        key={swipeKey}
                        onSwipeComplete={isActiveChallenge ? onSwipeProve : onSwipeJoin}
                        label={isActiveChallenge ? 'Swipe to Prove' : 'Swipe to Join Challenge'}
                    />
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    bottomContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingTop: spacing.md,
        paddingHorizontal: spacing.lg,
        borderTopWidth: 1,
        alignItems: 'center',
        zIndex: 10,
    },
    doneButton: {
        height: 56,
        borderRadius: borderRadius.lg,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        width: '100%',
    },
    doneButtonDisabled: {
        opacity: 0.6,
    },
    doneButtonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    doneButtonTextDisabled: {
        fontSize: 16,
        fontWeight: '600',
    },
    habitSeedText: {
        fontSize: 13,
        textAlign: 'center',
    },
    reassuranceText: {
        fontSize: 12,
        marginBottom: spacing.sm,
    },
});
