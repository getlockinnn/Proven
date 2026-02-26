import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import {
  findOrCreateProfile,
  followUser,
  getAllFollowingIds,
  getFollowCounts,
  TapestryProfileWithSocial,
  unfollowUser,
} from '../services/tapestryService';
import { TAPESTRY_API_KEY } from '../lib/tapestry/client';

interface TapestryContextType {
  tapestryProfile: TapestryProfileWithSocial | null;
  tapestryProfileId: string | null;
  isProfileLoading: boolean;
  followerCount: number;
  followingCount: number;
  followingIds: string[];
  isFollowing: (profileId: string) => boolean;
  follow: (targetProfileId: string) => Promise<void>;
  unfollow: (targetProfileId: string) => Promise<void>;
}

const TapestryContext = createContext<TapestryContextType | undefined>(undefined);

export function TapestryProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [tapestryProfile, setTapestryProfile] = useState<TapestryProfileWithSocial | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const currentUserIdRef = useRef<string | null>(null);

  const tapestryProfileId = tapestryProfile?.profile.id || null;
  const followingSet = useMemo(() => new Set(followingIds), [followingIds]);

  const isFollowing = useCallback(
    (profileId: string) => followingSet.has(profileId),
    [followingSet]
  );

  const initProfile = useCallback(async () => {
    if (!user || !TAPESTRY_API_KEY) return;
    if (currentUserIdRef.current === user.id && tapestryProfile) return;

    setIsProfileLoading(true);
    try {
      const profile = await findOrCreateProfile({
        id: user.id,
        username: user.username || user.id,
        name: user.name || 'User',
        walletAddress: user.walletAddress || null,
        profilePicture: user.profilePicture || '',
      });

      setTapestryProfile(profile);
      setFollowerCount(profile.socialCounts.followers);
      setFollowingCount(profile.socialCounts.following);
      currentUserIdRef.current = user.id;

      const ids = await getAllFollowingIds(profile.profile.id);
      setFollowingIds(ids);
    } catch (error) {
      console.error('[Tapestry] Failed to init profile:', error);
    } finally {
      setIsProfileLoading(false);
    }
  }, [tapestryProfile, user]);

  const refreshCounts = useCallback(async () => {
    if (!tapestryProfileId) return;
    try {
      const counts = await getFollowCounts(tapestryProfileId);
      setFollowerCount(counts.followers);
      setFollowingCount(counts.following);
    } catch (error) {
      console.error('[Tapestry] Failed to refresh counts:', error);
    }
  }, [tapestryProfileId]);

  const follow = useCallback(
    async (targetProfileId: string) => {
      if (!tapestryProfileId || !targetProfileId || targetProfileId === tapestryProfileId) return;
      if (followingSet.has(targetProfileId)) return;

      setFollowingIds((prev) => [...prev, targetProfileId]);
      setFollowingCount((prev) => prev + 1);
      try {
        await followUser(tapestryProfileId, targetProfileId);
        void refreshCounts();
      } catch (error) {
        setFollowingIds((prev) => prev.filter((id) => id !== targetProfileId));
        setFollowingCount((prev) => Math.max(0, prev - 1));
        console.error('[Tapestry] Follow failed:', error);
        throw error;
      }
    },
    [followingSet, refreshCounts, tapestryProfileId]
  );

  const unfollow = useCallback(
    async (targetProfileId: string) => {
      if (!tapestryProfileId || !targetProfileId || targetProfileId === tapestryProfileId) return;
      if (!followingSet.has(targetProfileId)) return;

      setFollowingIds((prev) => prev.filter((id) => id !== targetProfileId));
      setFollowingCount((prev) => Math.max(0, prev - 1));
      try {
        await unfollowUser(tapestryProfileId, targetProfileId);
        void refreshCounts();
      } catch (error) {
        setFollowingIds((prev) => [...prev, targetProfileId]);
        setFollowingCount((prev) => prev + 1);
        console.error('[Tapestry] Unfollow failed:', error);
        throw error;
      }
    },
    [followingSet, refreshCounts, tapestryProfileId]
  );

  useEffect(() => {
    if (authLoading) return;

    if (isAuthenticated && user) {
      void initProfile();
    } else {
      setTapestryProfile(null);
      setFollowingIds([]);
      setFollowerCount(0);
      setFollowingCount(0);
      currentUserIdRef.current = null;
    }
  }, [authLoading, initProfile, isAuthenticated, user]);

  const value: TapestryContextType = {
    tapestryProfile,
    tapestryProfileId,
    isProfileLoading,
    followerCount,
    followingCount,
    followingIds,
    isFollowing,
    follow,
    unfollow,
  };

  return <TapestryContext.Provider value={value}>{children}</TapestryContext.Provider>;
}

export function useTapestry(): TapestryContextType {
  const ctx = useContext(TapestryContext);
  if (!ctx) throw new Error('useTapestry must be used within a TapestryProvider');
  return ctx;
}
