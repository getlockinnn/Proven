/**
 * Leaderboard Service - API calls for leaderboard data with caching
 */

import { get, NetworkError } from '../lib/api';
import { API_ENDPOINTS } from '../lib/api/config';
import { getStaleFromCache } from '../lib/offline';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatar: string;
  earned: number;
  earnings: number;
  challengesCompleted: number;
  streak: number;
  isCurrentUser?: boolean;
}

/**
 * Transform backend entry to UI format
 */
function transformEntry(entry: any): LeaderboardEntry {
  const resolvedUserId =
    entry?.userId ??
    entry?.user_id ??
    entry?.id ??
    entry?.profileId ??
    entry?.profile?.id ??
    '';

  const resolvedName =
    entry?.name ??
    entry?.username ??
    entry?.displayName ??
    entry?.preferredName ??
    'User';

  const resolvedAvatar =
    entry?.avatar ??
    entry?.profilePicture ??
    entry?.image ??
    `${process.env.EXPO_PUBLIC_DEFAULT_AVATAR_BASE_URL}${resolvedUserId || resolvedName}`;

  return {
    ...entry,
    rank: Number(entry?.rank || 0),
    userId: String(resolvedUserId),
    name: String(resolvedName),
    avatar: String(resolvedAvatar),
    earned: entry.earned || entry.earnings,
    earnings: entry.earnings || entry.earned,
    isCurrentUser: Boolean(entry?.isCurrentUser ?? entry?.is_current_user),
  };
}

/**
 * Fetch leaderboard for a specific period with caching
 */
export async function fetchLeaderboard(
  period: 'daily' | 'weekly' | 'allTime' = 'weekly'
): Promise<LeaderboardEntry[]> {
  try {
    const result = await get<any>(
      `${API_ENDPOINTS.LEADERBOARD}?period=${period}`,
      true,
      { cacheKey: 'leaderboard', cacheId: period }
    );
    const entries = result.leaderboard || result || [];
    return entries.map(transformEntry);
  } catch (error) {
    if (error instanceof NetworkError) {
      const stale = await getStaleFromCache<any>('leaderboard', period);
      if (stale) {
        console.log(`[Leaderboard] Returning cached ${period} data`);
        const entries = stale.data?.leaderboard || stale.data || [];
        return entries.map(transformEntry);
      }
    }
    console.error('Error fetching leaderboard:', error);
    return [];
  }
}
