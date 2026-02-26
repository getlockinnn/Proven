/**
 * Stake Payment Modal
 * Shows QR code and address for users to send USDC from any wallet.
 * Supports two verification paths:
 *   1. Automatic: Solana Pay QR scanned by a compatible wallet (reference-key based)
 *   2. Manual:   User sends from any wallet and pastes the transaction signature
 */

import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, spacing, typography } from '../../constants/theme';
import { useTheme } from '../../context/ThemeContext';
import {
  completeSolanaPayJoin,
  getSolanaPayUrl,
  verifyTransfer,
} from '../../services/challengeService';

type PaymentStep = 'loading' | 'ready' | 'verifying' | 'success' | 'error';

interface StakePaymentModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  challengeId: string;
  challengeTitle: string;
  stakeAmount: number;
}

interface PaymentData {
  escrowAddress: string;
  amount: number;
  referenceKey: string;
  solanaPayUrl: string;
  usdcMint: string;
}

export function StakePaymentModal({
  visible,
  onClose,
  onSuccess,
  challengeId,
  challengeTitle,
  stakeAmount,
}: StakePaymentModalProps) {
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();

  const [step, setStep] = useState<PaymentStep>('loading');
  const [error, setError] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [copied, setCopied] = useState(false);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const [manualTxSignature, setManualTxSignature] = useState('');
  const [manualVerifying, setManualVerifying] = useState(false);

  const pollAbortRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setStep('loading');
      setError(null);
      setPaymentData(null);
      setCopied(false);
      setManualTxSignature('');
      setManualVerifying(false);
      pollAbortRef.current = false;
      initializePayment();
    } else {
      pollAbortRef.current = true;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  }, [visible, challengeId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pollAbortRef.current = true;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const initializePayment = async () => {
    try {
      console.log('[StakePayment] Initializing payment for challenge:', challengeId);
      
      const data = await getSolanaPayUrl(challengeId);
      console.log('[StakePayment] Got payment data:', data);
      
      if (!data) {
        setStep('error');
        setError('Unable to create payment. The challenge may not have an escrow address configured.');
        return;
      }

      if (!data.escrowAddress) {
        setStep('error');
        setError('This challenge does not have an escrow address. Please contact support.');
        return;
      }

      setPaymentData({
        escrowAddress: data.escrowAddress,
        amount: data.amount,
        referenceKey: data.referenceKey,
        solanaPayUrl: data.solanaPayUrl,
        usdcMint: data.usdcMint,
      });
      setStep('ready');

      // Start polling for payment verification
      startVerificationPolling(data.referenceKey);
    } catch (err: any) {
      console.error('Init payment error:', err);
      setStep('error');
      const errorMessage = err?.message || 'Something went wrong. Please try again.';
      setError(errorMessage);
    }
  };

  const startVerificationPolling = (referenceKey: string) => {
    // Poll every 5 seconds
    pollIntervalRef.current = setInterval(async () => {
      if (pollAbortRef.current) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        return;
      }

      setVerificationAttempt(prev => prev + 1);

      try {
        const result = await verifyTransfer(referenceKey);

        if (result.status === 'confirmed' && result.signature) {
          // Payment confirmed!
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }

          setStep('verifying');

          // Complete the join
          const joinResult = await completeSolanaPayJoin(
            referenceKey,
            result.signature
          );

          if (joinResult.success) {
            setStep('success');
            setTimeout(() => {
              onSuccess();
            }, 1500);
          } else {
            setStep('error');
            setError(joinResult.message || 'Failed to complete enrollment');
          }
        }
      } catch (err) {
        console.warn('Verification poll error:', err);
        // Continue polling even on errors
      }
    }, 5000);
  };

  const handleCopyAddress = async () => {
    if (!paymentData) return;
    await Clipboard.setStringAsync(paymentData.escrowAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePasteSignature = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setManualTxSignature(text.trim());
    }
  };

  /**
   * Manual verification: user pasted a tx signature from their external wallet.
   * Calls completeSolanaPayJoin directly, bypassing reference-key polling.
   */
  const handleManualVerify = async () => {
    if (!paymentData || !manualTxSignature.trim()) return;

    Keyboard.dismiss();
    setManualVerifying(true);

    try {
      const joinResult = await completeSolanaPayJoin(
        paymentData.referenceKey,
        manualTxSignature.trim()
      );

      if (joinResult.success) {
        // Stop polling — we're done
        pollAbortRef.current = true;
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        setStep('success');
        setTimeout(() => onSuccess(), 1500);
      } else {
        setError(joinResult.message || 'Could not verify this transaction. Make sure you sent the correct USDC amount to the escrow address.');
        setManualVerifying(false);
      }
    } catch (err: any) {
      console.error('Manual verify error:', err);
      setError(err?.message || 'Verification failed. Please try again.');
      setManualVerifying(false);
    }
  };

  const handleRetry = () => {
    initializePayment();
  };

  const renderContent = () => {
    switch (step) {
      case 'loading':
        return (
          <View style={styles.centeredContent}>
            <ActivityIndicator size="large" color={colors.provenGreen} />
            <Text style={[styles.statusText, { color: colors.textSecondary }]}>
              Preparing payment...
            </Text>
          </View>
        );

      case 'ready':
        return (
          <View style={styles.content}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Stake {stakeAmount} USDC
            </Text>

            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Send exactly <Text style={{ fontWeight: '700' }}>{stakeAmount} USDC</Text> to the address below from any Solana wallet.
            </Text>

            {/* QR Code */}
            {paymentData && (
              <View style={[styles.qrContainer, { backgroundColor: '#FFFFFF' }]}>
                <QRCode
                  value={paymentData.solanaPayUrl}
                  size={180}
                  backgroundColor="#FFFFFF"
                  color="#000000"
                />
              </View>
            )}

            {/* Address */}
            <View style={[styles.addressContainer, { backgroundColor: colors.warmGray }]}>
              <Text style={[styles.addressLabel, { color: colors.textMuted }]}>
                ESCROW ADDRESS
              </Text>
              <Text style={[styles.addressText, { color: colors.textPrimary }]} numberOfLines={1}>
                {paymentData?.escrowAddress}
              </Text>
              <Pressable
                style={[styles.copyButton, { backgroundColor: colors.provenGreen }]}
                onPress={handleCopyAddress}
              >
                <Ionicons
                  name={copied ? 'checkmark' : 'copy-outline'}
                  size={16}
                  color="#FFFFFF"
                />
                <Text style={styles.copyButtonText}>
                  {copied ? 'Copied!' : 'Copy Address'}
                </Text>
              </Pressable>
            </View>

            {/* Network info */}
            <View style={[styles.infoBox, { backgroundColor: `${colors.warning}15` }]}>
              <Ionicons name="warning-outline" size={18} color={colors.warning} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                <Text style={{ fontWeight: '600' }}>Solana Devnet</Text> • Only send USDC on Devnet. Mainnet funds will be lost.
              </Text>
            </View>

            {/* Auto-verification status (Solana Pay QR path) */}
            <View style={styles.verificationStatus}>
              <ActivityIndicator size="small" color={colors.textMuted} />
              <Text style={[styles.verificationText, { color: colors.textMuted }]}>
                Auto-detecting payment... {verificationAttempt > 0 ? `(check ${verificationAttempt})` : ''}
              </Text>
            </View>

            {/* Manual verification — paste transaction signature */}
            <View style={[styles.manualSection, { borderTopColor: colors.border }]}>
              <Text style={[styles.manualLabel, { color: colors.textSecondary }]}>
                Sent from an external wallet? Paste the transaction signature:
              </Text>
              <View style={[styles.txInputRow, { backgroundColor: colors.warmGray }]}>
                <TextInput
                  style={[styles.txInput, { color: colors.textPrimary }]}
                  placeholder="Paste transaction signature..."
                  placeholderTextColor={colors.textMuted}
                  value={manualTxSignature}
                  onChangeText={setManualTxSignature}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                />
                <Pressable
                  style={[styles.pasteButton, { backgroundColor: colors.border }]}
                  onPress={handlePasteSignature}
                >
                  <Ionicons name="clipboard-outline" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>

              <Pressable
                style={[
                  styles.primaryButton,
                  {
                    backgroundColor: manualTxSignature.trim()
                      ? colors.provenGreen
                      : colors.border,
                  },
                ]}
                onPress={handleManualVerify}
                disabled={!manualTxSignature.trim() || manualVerifying}
              >
                {manualVerifying ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>Verify Payment</Text>
                  </>
                )}
              </Pressable>
            </View>

            {error && (
              <View style={[styles.infoBox, { backgroundColor: `${colors.error}15` }]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
                <Text style={[styles.infoText, { color: colors.error }]}>{error}</Text>
              </View>
            )}

            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        );

      case 'verifying':
        return (
          <View style={styles.centeredContent}>
            <ActivityIndicator size="large" color={colors.provenGreen} />
            <Text style={[styles.statusText, { color: colors.textPrimary }]}>
              Verifying your payment...
            </Text>
            <Text style={[styles.subStatusText, { color: colors.textSecondary }]}>
              This may take a moment
            </Text>
          </View>
        );

      case 'success':
        return (
          <View style={styles.centeredContent}>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.provenGreen}20` }]}>
              <Ionicons name="checkmark-circle" size={60} color={colors.provenGreen} />
            </View>
            <Text style={[styles.title, { color: colors.provenGreen }]}>
              Payment Confirmed!
            </Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {`You've joined "${challengeTitle}". Good luck!`}
            </Text>
          </View>
        );

      case 'error':
        return (
          <View style={styles.content}>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.error}20` }]}>
              <Ionicons name="alert-circle" size={40} color={colors.error} />
            </View>

            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Something Went Wrong
            </Text>

            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {error}
            </Text>

            <Pressable
              style={[styles.primaryButton, { backgroundColor: colors.provenGreen }]}
              onPress={handleRetry}
            >
              <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </Pressable>

            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
                Close
              </Text>
            </Pressable>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Backdrop */}
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPressable} onPress={onClose} />
      </View>

      {/* Modal Content */}
      <View
        style={[
          styles.modalContainer,
          { backgroundColor: colors.cardBackground, paddingBottom: insets.bottom + spacing.lg },
          shadows.lg,
        ]}
      >
        {/* Handle Bar */}
        <View style={[styles.handleBar, { backgroundColor: colors.warmGray }]} />

        {renderContent()}
      </View>
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
    minHeight: 400,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  content: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    minHeight: 300,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.heading2,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  statusText: {
    ...typography.body,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  subStatusText: {
    ...typography.caption,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  qrContainer: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  addressContainer: {
    width: '100%',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  addressLabel: {
    ...typography.caption,
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  addressText: {
    ...typography.body,
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  copyButtonText: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
    width: '100%',
  },
  infoText: {
    flex: 1,
    ...typography.caption,
    lineHeight: 18,
  },
  verificationStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  verificationText: {
    ...typography.caption,
  },
  manualSection: {
    width: '100%',
    borderTopWidth: 1,
    paddingTop: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  manualLabel: {
    ...typography.caption,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  txInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    paddingLeft: spacing.sm,
    overflow: 'hidden',
  },
  txInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  pasteButton: {
    padding: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    width: '100%',
    marginBottom: spacing.md,
  },
  primaryButtonText: {
    ...typography.bodyBold,
    color: '#FFFFFF',
  },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    width: '100%',
    marginBottom: spacing.md,
  },
  outlineButtonText: {
    ...typography.bodyBold,
  },
  secondaryButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    ...typography.body,
  },
});
