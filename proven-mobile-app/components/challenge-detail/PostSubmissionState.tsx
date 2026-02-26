import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { borderRadius, spacing } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';

interface PostSubmissionStateProps {
    status: 'pending' | 'submitted' | 'under_review' | 'approved' | 'rejected';
    stakeAmount: number;
    totalDays: number;
    ruleDescription: string;
    dayNumber: number;
    transactionSignature?: string | null;
    hasWallet?: boolean;
    onSaveWallet?: (address: string) => Promise<void>;
}

export function PostSubmissionState({
    status,
    stakeAmount,
    totalDays,
    ruleDescription,
    dayNumber,
    transactionSignature,
    hasWallet = true,
    onSaveWallet,
}: PostSubmissionStateProps) {
    const { colors } = useTheme();
    const [walletInput, setWalletInput] = useState('');
    const [saving, setSaving] = useState(false);

    const openSolscan = () => {
        if (transactionSignature) {
            Linking.openURL(`https://solscan.io/tx/${transactionSignature}`);
        }
    };

    const handleSaveWallet = async () => {
        const trimmed = walletInput.trim();
        if (!trimmed) {
            Alert.alert('Enter wallet', 'Please paste your Solana wallet address.');
            return;
        }
        // Basic Solana address validation (base58, 32-44 chars)
        if (trimmed.length < 32 || trimmed.length > 44) {
            Alert.alert('Invalid address', 'Please enter a valid Solana wallet address.');
            return;
        }
        if (onSaveWallet) {
            setSaving(true);
            try {
                await onSaveWallet(trimmed);
                Alert.alert('Wallet saved', 'Your payout will be processed shortly.');
            } catch {
                Alert.alert('Error', 'Failed to save wallet address. Please try again.');
            } finally {
                setSaving(false);
            }
        }
    };

    if (status === 'approved') {
        return (
            <View style={styles.successStateContainer}>
                <View style={styles.successConfirmation}>
                    <View style={styles.approvedIconCircle}>
                        <Ionicons name="checkmark" size={32} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Proof Verified for Today</Text>
                    <Text style={[styles.secondaryStatusText, { color: colors.textSecondary }]}>
                        Day {dayNumber} complete • streak continues
                    </Text>
                </View>

                {/* Reward Disclosure */}
                <View style={styles.rewardRow}>
                    <Ionicons name="cash-outline" size={16} color={colors.provenGreen} />
                    <Text style={styles.rewardText}>
                        +${totalDays > 0 ? (stakeAmount / totalDays).toFixed(2) : stakeAmount}
                        {transactionSignature ? ' sent to your wallet' : ' payout queued'}
                    </Text>
                </View>

                {/* Solscan Transaction Link */}
                {transactionSignature && (
                    <Pressable onPress={openSolscan} style={styles.txLinkRow}>
                        <Ionicons name="open-outline" size={14} color="#1565C0" />
                        <Text style={styles.txLinkText}>View transaction on Solscan</Text>
                    </Pressable>
                )}

                {/* Wallet Missing Banner */}
                {!hasWallet && !transactionSignature && (
                    <View style={styles.walletBanner}>
                        <Ionicons name="wallet-outline" size={18} color="#E65100" />
                        <Text style={styles.walletBannerText}>
                            Add your Solana wallet to receive payouts
                        </Text>
                        <View style={styles.walletInputRow}>
                            <TextInput
                                style={styles.walletInput}
                                placeholder="Paste Solana address..."
                                placeholderTextColor="#999"
                                value={walletInput}
                                onChangeText={setWalletInput}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <Pressable
                                style={[styles.walletSaveBtn, saving && { opacity: 0.6 }]}
                                onPress={handleSaveWallet}
                                disabled={saving}
                            >
                                {saving ? (
                                    <ActivityIndicator size="small" color="#FFF" />
                                ) : (
                                    <Text style={styles.walletSaveBtnText}>Save</Text>
                                )}
                            </Pressable>
                        </View>
                    </View>
                )}

                <View style={[styles.divider, { backgroundColor: colors.border }]} />

                {/* Completed Requirement Card */}
                <View style={[styles.reqItem, { backgroundColor: colors.cardBackground, borderColor: colors.border, opacity: 0.6 }]}>
                    <Ionicons name="checkmark-circle" size={24} color={colors.textSecondary} />
                    <Text style={[styles.reqText, { color: colors.textSecondary, textDecorationLine: 'line-through' }]}>
                        {ruleDescription}
                    </Text>
                </View>
            </View>
        );
    }

    if (status === 'rejected') {
        return (
            <View style={styles.successStateContainer}>
                <View style={styles.successConfirmation}>
                    <View style={styles.rejectedIconCircle}>
                        <Ionicons name="close" size={32} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.successTitle, { color: colors.textPrimary }]}>{"Proof didn't meet requirements"}</Text>
                </View>

                {/* Reason Card */}
                <View style={styles.reasonCard}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Text style={{ fontSize: 16 }}>⛔</Text>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.reasonText}>{"Image didn't clearly show today's activity"}</Text>
                            <Text style={styles.tipText}>Tip: Make sure the app name and time are visible.</Text>
                        </View>
                    </View>
                </View>

                {/* Consequence */}
                <Text style={[styles.consequenceText, { color: colors.textSecondary }]}>
                    You can continue the challenge tomorrow.
                </Text>

                <View style={[styles.divider, { backgroundColor: colors.border }]} />
            </View>
        );
    }

    // Default: Under Review
    return (
        <View style={styles.successStateContainer}>
            <View style={styles.successConfirmation}>
                <View style={styles.reviewIconCircle}>
                    <Ionicons name="hourglass-outline" size={32} color="#FFFFFF" />
                </View>
                <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Under Review</Text>
                <Text style={[styles.secondaryStatusText, { color: colors.textSecondary }]}>
                    Usually reviewed within 24 hours
                </Text>
            </View>

            <View style={styles.successDetails}>
                <Text style={[styles.successNextStep, { color: colors.textSecondary }]}>{"You'll be notified once reviewed."}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    successStateContainer: {
        alignItems: 'center',
        paddingVertical: spacing.xl,
        gap: spacing.md,
        width: '100%',
    },
    successConfirmation: {
        alignItems: 'center',
        gap: spacing.md,
        marginBottom: spacing.md,
    },
    reviewIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#F59E0B', // Amber
        justifyContent: 'center',
        alignItems: 'center',
    },
    approvedIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#4B8F50', // Muted Green
        justifyContent: 'center',
        alignItems: 'center',
    },
    rejectedIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#D65D5D', // Soft Red
        justifyContent: 'center',
        alignItems: 'center',
    },
    successTitle: {
        fontSize: 22,
        fontWeight: '700',
        textAlign: 'center',
    },
    secondaryStatusText: {
        fontSize: 14,
        marginTop: 4,
        textAlign: 'center',
    },
    successDetails: {
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.xl,
    },
    successNextStep: {
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
    },
    rewardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#F1F8E9', // Light green bg
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        marginBottom: 4,
    },
    rewardText: {
        color: '#33691E',
        fontWeight: '600',
        fontSize: 14,
    },
    txLinkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 12,
    },
    txLinkText: {
        color: '#1565C0',
        fontSize: 13,
        textDecorationLine: 'underline',
    },
    walletBanner: {
        width: '100%',
        backgroundColor: '#FFF3E0',
        padding: 14,
        borderRadius: 12,
        gap: 8,
        alignItems: 'center',
    },
    walletBannerText: {
        color: '#E65100',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
    },
    walletInputRow: {
        flexDirection: 'row',
        gap: 8,
        width: '100%',
    },
    walletInput: {
        flex: 1,
        backgroundColor: '#FFF',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 13,
        borderWidth: 1,
        borderColor: '#E0E0E0',
        color: '#333',
    },
    walletSaveBtn: {
        backgroundColor: '#E65100',
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        justifyContent: 'center',
    },
    walletSaveBtnText: {
        color: '#FFF',
        fontWeight: '600',
        fontSize: 13,
    },
    divider: {
        height: 1,
        width: '100%',
        marginVertical: spacing.sm,
    },
    reqItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.md,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        width: '100%',
        gap: spacing.md,
    },
    reqText: {
        fontSize: 16,
        flex: 1,
        lineHeight: 24,
    },
    reasonCard: {
        width: '100%',
        backgroundColor: '#FFEBEE', // Light red
        padding: 16,
        borderRadius: 12,
        marginBottom: 8,
    },
    reasonText: {
        color: '#C62828',
        fontSize: 15,
        fontWeight: '500',
    },
    tipText: {
        fontSize: 13,
        color: '#C62828',
        marginTop: 4,
        fontStyle: 'italic',
    },
    consequenceText: {
        fontSize: 14,
        textAlign: 'center',
        paddingHorizontal: 20,
        marginBottom: 16,
    },
});
