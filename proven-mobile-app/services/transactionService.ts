/**
 * Transaction Service - API calls for transaction history with caching
 */

import { get, NetworkError } from '../lib/api';
import { API_ENDPOINTS } from '../lib/api/config';
import { getStaleFromCache } from '../lib/offline';

export interface Transaction {
  id: string;
  type: 'stake' | 'reward' | 'refund' | 'withdrawal';
  title: string;
  description: string;
  amount: number;
  date: string;
  challengeId?: string;
  challengeTitle?: string;
  signature?: string | null;
}

export interface TransactionSummary {
  totalEarned: number;
  totalStaked: number;
  netBalance: number;
}

interface TransactionsResponse {
  transactions: Transaction[];
  summary: TransactionSummary;
}

/**
 * Calculate summary from transactions
 */
function calculateSummary(transactions: Transaction[]): TransactionSummary {
  let totalEarned = 0;
  let totalStaked = 0;

  for (const tx of transactions) {
    if (tx.amount > 0) {
      totalEarned += tx.amount;
    } else {
      totalStaked += Math.abs(tx.amount);
    }
  }

  return {
    totalEarned,
    totalStaked,
    netBalance: totalEarned - totalStaked,
  };
}

/**
 * Transform backend transaction to UI format
 */
function transformTransaction(tx: any): Transaction {
  let type: Transaction['type'] = 'stake';
  let title = 'Transaction';

  switch (tx.transactionType?.toUpperCase()) {
    case 'STAKE':
      type = 'stake';
      title = 'Challenge Joined';
      break;
    case 'REWARD':
      type = 'reward';
      title = 'Challenge Completed';
      break;
    case 'REFUND':
      type = 'refund';
      title = 'Challenge Cancelled';
      break;
    case 'WITHDRAWAL':
      type = 'withdrawal';
      title = 'Withdrawal';
      break;
  }

  return {
    id: tx.id,
    type,
    title: tx.title || title,
    description: tx.description || tx.challenge?.title || 'Challenge',
    amount: tx.transactionType === 'STAKE' ? -Math.abs(tx.amount) : tx.amount,
    date: tx.timestamp || tx.createdAt,
    challengeId: tx.challengeId,
    challengeTitle: tx.challenge?.title,
    signature: tx.transactionSignature || null,
  };
}

/**
 * Fetch transaction history with caching
 */
export async function fetchTransactions(): Promise<TransactionsResponse> {
  try {
    const response = await get<any>(API_ENDPOINTS.TRANSACTIONS, true, {
      cacheKey: 'transactions',
    });

    const rawTransactions = Array.isArray(response) ? response : response.transactions || [];
    const transactions = rawTransactions.map(transformTransaction);

    return {
      transactions,
      summary: response.summary || calculateSummary(transactions),
    };
  } catch (error) {
    if (error instanceof NetworkError) {
      const stale = await getStaleFromCache<any>('transactions');
      if (stale) {
        console.log('[Transactions] Returning cached data');
        const rawTransactions = Array.isArray(stale.data) ? stale.data : stale.data?.transactions || [];
        const transactions = rawTransactions.map(transformTransaction);
        return {
          transactions,
          summary: stale.data?.summary || calculateSummary(transactions),
        };
      }
    }
    console.error('Error fetching transactions:', error);
    return {
      transactions: [],
      summary: { totalEarned: 0, totalStaked: 0, netBalance: 0 },
    };
  }
}

/**
 * Get wallet balance from transactions
 */
export async function getWalletBalance(): Promise<number> {
  const { summary } = await fetchTransactions();
  return summary.netBalance;
}
