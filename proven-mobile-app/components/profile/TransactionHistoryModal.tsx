import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { borderRadius, colors, shadows, spacing, typography } from '../../constants/theme';
import {
  fetchTransactions,
  Transaction,
  TransactionSummary,
} from '../../services/transactionService';

interface TransactionHistoryModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TransactionHistoryModal({
  visible,
  onClose
}: TransactionHistoryModalProps) {
  const insets = useSafeAreaInsets();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<TransactionSummary>({
    totalEarned: 0,
    totalStaked: 0,
    netBalance: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      loadTransactions();
    }
  }, [visible]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const data = await fetchTransactions();
      setTransactions(data.transactions);
      setSummary(data.summary);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTransactionIcon = (type: Transaction['type']): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'reward': return 'trophy';
      case 'stake': return 'arrow-up-circle';
      case 'refund': return 'refresh-circle';
      case 'withdrawal': return 'wallet';
      default: return 'cash';
    }
  };

  const getTransactionColor = (type: Transaction['type']) => {
    switch (type) {
      case 'reward': return colors.success;
      case 'stake': return colors.warning;
      case 'refund': return colors.info;
      case 'withdrawal': return colors.error;
      default: return colors.textMuted;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Generate Solscan URL for transaction signature
  // Using devnet cluster - change to mainnet when in production
  const getSolscanUrl = (signature: string) => {
    return `${process.env.EXPO_PUBLIC_SOLSCAN_BASE_URL}/tx/${signature}?cluster=${process.env.EXPO_PUBLIC_SOLANA_NETWORK}`;
  };

  const openExplorer = (signature: string | null | undefined) => {
    if (!signature || signature.startsWith('mock') || signature.startsWith('dev_mode')) {
      return; // Don't open explorer for mock/dev signatures
    }
    Linking.openURL(getSolscanUrl(signature));
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
          <View style={styles.headerButton} />
          <Text style={styles.headerTitle}>Transaction History</Text>
          <Pressable onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={24} color={colors.provenDark} />
          </Pressable>
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Earned</Text>
            <Text style={[styles.summaryValue, { color: colors.success }]}>
              ${summary.totalEarned.toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Staked</Text>
            <Text style={[styles.summaryValue, { color: colors.warning }]}>
              ${summary.totalStaked.toFixed(2)}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.provenGreen} />
          </View>
        ) : transactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptySubtext}>
              Join a challenge to see your transactions here
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <View style={styles.transactionsList}>
              {transactions.map((transaction, index) => {
                const hasValidSignature = transaction.signature &&
                  !transaction.signature.startsWith('mock') &&
                  !transaction.signature.startsWith('dev_mode');
                const transactionKey = [
                  transaction.id || 'tx',
                  transaction.signature || 'nosig',
                  transaction.date || 'nodate',
                  transaction.type || 'notype',
                  transaction.amount ?? 'noamount',
                  index,
                ].join(':');

                return (
                  <Pressable
                    key={transactionKey}
                    style={[
                      styles.transactionItem,
                      index !== transactions.length - 1 && styles.transactionBorder
                    ]}
                    onPress={() => hasValidSignature && openExplorer(transaction.signature)}
                    disabled={!hasValidSignature}
                  >
                    <View style={[
                      styles.transactionIcon,
                      { backgroundColor: `${getTransactionColor(transaction.type)}15` }
                    ]}>
                      <Ionicons
                        name={getTransactionIcon(transaction.type)}
                        size={20}
                        color={getTransactionColor(transaction.type)}
                      />
                    </View>
                    <View style={styles.transactionInfo}>
                      <Text style={styles.transactionTitle}>{transaction.title}</Text>
                      <Text style={styles.transactionDescription}>
                        {transaction.description}
                      </Text>
                      <View style={styles.transactionMeta}>
                        <Text style={styles.transactionDate}>
                          {formatDate(transaction.date)}
                        </Text>
                        {hasValidSignature && (
                          <View style={styles.explorerLink}>
                            <Ionicons name="open-outline" size={12} color={colors.provenGreen} />
                            <Text style={styles.explorerLinkText}>View on Solscan</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text style={[
                      styles.transactionAmount,
                      { color: transaction.amount >= 0 ? colors.success : colors.textSecondary }
                    ]}>
                      {transaction.amount >= 0 ? '+' : ''}${Math.abs(transaction.amount).toFixed(2)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}
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
    marginBottom: spacing.lg,
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
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.sm,
    marginBottom: spacing.lg,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    ...typography.heading2,
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
  },
  transactionsList: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  transactionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  transactionIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitle: {
    ...typography.bodyBold,
    color: colors.provenDark,
  },
  transactionDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  transactionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: spacing.sm,
  },
  transactionDate: {
    ...typography.small,
    color: colors.textMuted,
  },
  explorerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  explorerLinkText: {
    ...typography.small,
    color: colors.provenGreen,
    fontWeight: '500',
  },
  transactionAmount: {
    ...typography.bodyBold,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    ...typography.heading3,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  emptySubtext: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
