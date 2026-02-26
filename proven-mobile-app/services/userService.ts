/**
 * User Service - API calls for user profile and settings with offline support
 */

import { get, put, NetworkError, OfflineQueuedError } from '../lib/api';
import { API_ENDPOINTS } from '../lib/api/config';
import { getStaleFromCache, invalidateCache } from '../lib/offline';
import { Connection, ParsedAccountData, PublicKey } from '@solana/web3.js';
import { SOLANA_CONFIG } from '../lib/solana/config';

export interface UserProfile {
  id: string;
  name: string;
  preferredName: string | null;
  bio: string | null;
  email: string;
  image: string;
  walletAddress?: string;
  walletBalanceUsdc?: number;
  createdAt: string;
  updatedAt: string;
  isAdmin: boolean;
  stats: {
    active: number;
    completed: number;
    proofsSubmitted?: number;
  };
}

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  profilePicture: string;
  walletAddress: string | null;
  walletBalance: number;
  streak: number;
  proofsSubmitted: number;
  challengesCompleted: number;
}

interface UserStatsResponse {
  streak?: number;
  proofsSubmitted?: number;
}

interface ParsedTokenAmount {
  uiAmount?: number | null;
  uiAmountString?: string;
}

interface ParsedTokenInfo {
  tokenAmount?: ParsedTokenAmount;
}

interface ParsedTokenAccountData extends ParsedAccountData {
  parsed: {
    info?: ParsedTokenInfo;
  };
}

const solanaConnection = new Connection(SOLANA_CONFIG.rpcEndpoint, SOLANA_CONFIG.commitment);

/**
 * Transform backend profile to UI User format
 */
function transformToUser(profile: UserProfile, walletBalance: number = 0, streak: number = 0): User {
  return {
    id: profile.id,
    name: profile.preferredName || profile.name || 'User',
    username: profile.preferredName || profile.email?.split('@')[0] || 'user',
    email: profile.email || '',
    profilePicture: profile.image || `${process.env.EXPO_PUBLIC_DEFAULT_AVATAR_BASE_URL}${profile.id}`,
    walletAddress: profile.walletAddress || null,
    walletBalance,
    streak,
    proofsSubmitted: profile.stats?.proofsSubmitted || 0,
    challengesCompleted: profile.stats?.completed || 0,
  };
}

/**
 * Calculate streak from user's submission history
 */
async function getUserStats(): Promise<UserStatsResponse> {
  try {
    const stats = await get<UserStatsResponse>('/users/me/stats');
    return {
      streak: stats?.streak || 0,
      proofsSubmitted: stats?.proofsSubmitted || 0,
    };
  } catch {
    return {};
  }
}

function getParsedTokenAccountUiAmount(accountData: ParsedTokenAccountData): number {
  const tokenAmount = accountData.parsed.info?.tokenAmount;
  if (!tokenAmount) return 0;

  if (typeof tokenAmount.uiAmount === 'number' && Number.isFinite(tokenAmount.uiAmount)) {
    return tokenAmount.uiAmount;
  }

  const parsedAmount = Number(tokenAmount.uiAmountString || '0');
  return Number.isFinite(parsedAmount) ? parsedAmount : 0;
}

async function fetchDevnetUsdcBalance(walletAddress: string | null | undefined): Promise<number | null> {
  if (!walletAddress) return null;

  try {
    const owner = new PublicKey(walletAddress);
    const tokenAccounts = await solanaConnection.getParsedTokenAccountsByOwner(owner, {
      mint: SOLANA_CONFIG.usdcMint,
    });

    const totalBalance = tokenAccounts.value.reduce((sum, tokenAccount) => {
      const accountData = tokenAccount.account.data;
      if (!('parsed' in accountData)) return sum;
      return sum + getParsedTokenAccountUiAmount(accountData as ParsedTokenAccountData);
    }, 0);

    return Number(totalBalance.toFixed(6));
  } catch {
    return null;
  }
}

/**
 * Get current user profile with caching
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  try {
    return await get<UserProfile>(API_ENDPOINTS.USER_PROFILE, true, {
      cacheKey: 'userProfile',
    });
  } catch (error) {
    if (error instanceof NetworkError) {
      const stale = await getStaleFromCache<UserProfile>('userProfile');
      if (stale) {
        console.log('[User] Returning cached profile');
        return stale.data;
      }
    }
    console.error('Error fetching user profile:', error);
    return null;
  }
}

/**
 * Get current user in UI format with caching
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const [profile, stats] = await Promise.all([
      getUserProfile(),
      getUserStats(),
    ]);

    if (!profile) return null;
    const onChainBalance = await fetchDevnetUsdcBalance(profile.walletAddress);
    const walletBalance = typeof onChainBalance === 'number'
      ? onChainBalance
      : typeof profile.walletBalanceUsdc === 'number'
        ? profile.walletBalanceUsdc
        : 0;
    const transformed = transformToUser(profile, walletBalance, stats.streak || 0);
    return {
      ...transformed,
      proofsSubmitted: stats.proofsSubmitted ?? transformed.proofsSubmitted,
    };
  } catch (error) {
    console.error('Error fetching current user:', error);
    return null;
  }
}

/**
 * Update user profile with offline queue support
 */
export async function updateUserProfile(data: {
  name?: string;
  preferredName?: string;
  bio?: string;
  image?: string;
  walletAddress?: string;
}): Promise<UserProfile | null> {
  try {
    const result = await put<UserProfile>(
      API_ENDPOINTS.USER_PROFILE,
      data,
      true,
      { queueable: true, queueType: 'profileUpdate' }
    );

    await invalidateCache('userProfile');
    return result;
  } catch (error) {
    if (error instanceof OfflineQueuedError) {
      console.log('[User] Profile update queued for sync');
      return null;
    }
    console.error('Error updating user profile:', error);
    return null;
  }
}
