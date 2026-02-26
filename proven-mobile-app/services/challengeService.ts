/**
 * Challenge Service - API calls for challenges with offline support
 */

import { get, post, NetworkError } from '../lib/api';
import { API_ENDPOINTS } from '../lib/api/config';
import { getStaleFromCache, invalidateCache } from '../lib/offline';
import type { SolanaPayData, TransferVerificationResult } from '../lib/solana/solanaPay';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  image: string;
  stakeAmount: number;
  totalPrizePool: number;
  participants: number;
  difficulty: string;
  metrics: string;
  rules: string[];
  startDate: string;
  endDate: string;
  verificationType: string;
  hostType: string;
  sponsor?: string;
  isCompleted?: boolean;
  // Mapped fields for UI compatibility
  imageUrl?: string;
  timeline?: string;
  prizePool?: number;
  status?: 'free' | 'active' | 'completed' | 'upcoming';
  category?: string;
}

const splitRulesFromString = (value: string): string[] => {
  return value
    .split(/\r?\n|•|;/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
};

const normalizeRules = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return splitRulesFromString(trimmed);
  }

  return [];
};

const getFallbackRules = (challenge: any): string[] => {
  const category = typeof challenge?.metrics === 'string' && challenge.metrics.trim()
    ? challenge.metrics.trim().toLowerCase()
    : 'challenge';

  return [
    `Complete your ${category} task for today.`,
    'Submit proof before 11:59 PM local time.',
    'Missed days are not eligible for payout.',
  ];
};

export interface UserChallenge {
  id: string;
  challengeId: string;
  userId: string;
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  progress: number;
  stakeAmount: number;
  startDate: string;
  endDate?: string;
  challenge: Challenge;
  // Today's submission status calculated by backend
  todayStatus?: 'not_submitted' | 'submitted' | 'approved' | 'rejected' | 'locked';
  todaySubmitted?: boolean;
  todayApproved?: boolean;
}

/**
 * Transform backend challenge to UI format
 */
function transformChallenge(challenge: any): Challenge {
  const startDate = new Date(challenge.startDate);
  const endDate = new Date(challenge.endDate);
  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  const parseNumber = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  // Some endpoints/backends may serialize stake under different keys or as a string/Decimal.
  const rawStakeAmount =
    challenge.stakeAmount ??
    challenge.userStake ??
    challenge.user_stake ??
    challenge.stake_amount ??
    challenge.stakeUsdc ??
    challenge.stake_usdc ??
    challenge.stake ??
    challenge.stake?.amount ??
    challenge.stake?.value;

  const normalizedStakeAmount = parseNumber(rawStakeAmount);
  const normalizedRules = [
    ...normalizeRules(challenge.rules),
    ...normalizeRules(challenge.trackingMetrics),
  ].filter((rule, index, arr) => arr.indexOf(rule) === index);
  const safeRules = normalizedRules.length > 0 ? normalizedRules : getFallbackRules(challenge);

  return {
    ...challenge,
    rules: safeRules,
    stakeAmount: normalizedStakeAmount ?? 0,
    imageUrl: challenge.image || challenge.imageUrl,
    prizePool: challenge.totalPrizePool || challenge.prizePool,
    timeline: challenge.timeline || challenge.duration || `${days} days`,
    status: challenge.status || determineStatus(challenge),
    category: challenge.category || challenge.metrics || 'Other',
  };
}

/**
 * Determine challenge status based on dates
 */
function determineStatus(challenge: any): 'free' | 'active' | 'completed' | 'upcoming' {
  if (challenge.isCompleted) return 'completed';

  const now = new Date();
  const startDate = new Date(challenge.startDate);
  const endDate = new Date(challenge.endDate);

  if (now < startDate) return 'upcoming';
  if (now > endDate) return 'completed';
  return 'active';
}

/**
 * Fetch all available challenges with caching
 */
export async function fetchChallenges(): Promise<Challenge[]> {
  try {
    const challenges = await get<any[]>(API_ENDPOINTS.CHALLENGES, false, {
      cacheKey: 'challenges',
    });
    return (challenges || []).map(transformChallenge);
  } catch (error) {
    if (error instanceof NetworkError) {
      const stale = await getStaleFromCache<any[]>('challenges');
      if (stale) {
        console.log('[Challenges] Returning stale cache due to network error');
        return (stale.data || []).map(transformChallenge);
      }
    }
    console.error('Error fetching challenges:', error);
    return [];
  }
}

/**
 * Fetch a single challenge by ID with caching
 */
export async function fetchChallengeById(id: string): Promise<Challenge | null> {
  try {
    const challenge = await get<any>(API_ENDPOINTS.CHALLENGE_BY_ID(id), false, {
      cacheKey: 'challengeDetail',
      cacheId: id,
    });
    return transformChallenge(challenge);
  } catch (error) {
    if (error instanceof NetworkError) {
      const stale = await getStaleFromCache<any>('challengeDetail', id);
      if (stale) {
        return transformChallenge(stale.data);
      }
    }
    console.error('Error fetching challenge:', error);
    return null;
  }
}

/**
 * Fetch user's challenges (active and completed) with caching
 */
export async function fetchUserChallenges(forceRefresh: boolean = false): Promise<{
  active: UserChallenge[];
  completed: UserChallenge[];
}> {
  try {
    const response = await get<{ success: boolean; userChallenges: UserChallenge[]; count: number }>(
      API_ENDPOINTS.CHALLENGE_USER,
      true,
      { cacheKey: 'userChallenges', forceRefresh }
    );

    const userChallenges = response?.userChallenges || [];
    const active = userChallenges.filter(uc => uc.status === 'ACTIVE');
    const completed = userChallenges.filter(uc => uc.status === 'COMPLETED' || uc.status === 'FAILED');

    return { active, completed };
  } catch (error) {
    if (error instanceof NetworkError) {
      const stale = await getStaleFromCache<{ success: boolean; userChallenges: UserChallenge[] }>('userChallenges');
      if (stale) {
        const userChallenges = stale.data?.userChallenges || [];
        return {
          active: userChallenges.filter(uc => uc.status === 'ACTIVE'),
          completed: userChallenges.filter(uc => uc.status === 'COMPLETED' || uc.status === 'FAILED'),
        };
      }
    }
    console.error('Error fetching user challenges:', error);
    return { active: [], completed: [] };
  }
}

/**
 * Join a challenge
 */
export async function joinChallenge(
  challengeId: string,
  stakeAmount: number,
  walletAddress?: string,
  transactionSignature?: string
): Promise<{ success: boolean; message: string }> {
  try {
    await post(API_ENDPOINTS.CHALLENGE_JOIN, {
      challengeId,
      stakeAmount,
      walletAddress,
      transactionSignature,
    });

    await invalidateCache('userChallenges');
    return { success: true, message: 'Successfully joined the challenge!' };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to join challenge' };
  }
}

/**
 * Check if user has joined a challenge
 */
export async function checkUserChallenge(challengeId: string): Promise<{
  hasJoined: boolean;
  userChallenge: UserChallenge | null;
}> {
  try {
    const result = await get<any>(API_ENDPOINTS.CHALLENGE_CHECK(challengeId));
    return {
      hasJoined: result.hasJoined || !!result.userChallenge,
      userChallenge: result.userChallenge || null,
    };
  } catch (error) {
    return { hasJoined: false, userChallenge: null };
  }
}

// ============================================================
// SOLANA PAY INTEGRATION
// ============================================================

/**
 * Get Solana Pay URL for staking in a challenge
 */
export async function getSolanaPayUrl(challengeId: string): Promise<SolanaPayData | null> {
  try {
    // apiRequest() auto-unwraps result.data, so the return is already SolanaPayData
    const response = await post<SolanaPayData>(
      API_ENDPOINTS.SOLANA_PAY_URL(challengeId),
      {}
    );
    if (!response) {
      console.error('Empty response from getSolanaPayUrl');
      return null;
    }
    // response IS already the SolanaPayData object (apiRequest unwraps .data)
    return response || null;
  } catch (error: any) {
    console.error('Error getting Solana Pay URL:', error?.message || error);
    throw error;
  }
}

/**
 * Verify if a transfer has been completed by reference key
 */
export async function verifyTransfer(referenceKey: string): Promise<TransferVerificationResult> {
  try {
    // apiRequest() auto-unwraps result.data, so the return is already TransferVerificationResult
    const response = await get<TransferVerificationResult>(
      API_ENDPOINTS.VERIFY_TRANSFER(referenceKey)
    );
    // response IS already the TransferVerificationResult (apiRequest unwraps .data)
    return response || { status: 'pending', message: 'Unable to verify' };
  } catch (error) {
    console.error('Error verifying transfer:', error);
    return { status: 'pending', message: 'Verification failed' };
  }
}

/**
 * Complete challenge join after Solana Pay transfer is confirmed
 */
export async function completeSolanaPayJoin(
  referenceKey: string,
  transactionSignature: string,
  walletAddress?: string
): Promise<{ success: boolean; message: string }> {
  try {
    await post(API_ENDPOINTS.COMPLETE_SOLANA_PAY_JOIN, {
      referenceKey,
      transactionSignature,
      walletAddress,
    });

    await invalidateCache('userChallenges');
    return { success: true, message: 'Successfully joined the challenge!' };
  } catch (error: any) {
    return { success: false, message: error.message || 'Failed to complete join' };
  }
}
