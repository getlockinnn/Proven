/**
 * Tapestry Service - social graph API wrappers using the `socialfi` SDK.
 */

import {
  tapestry,
  TAPESTRY_API_KEY,
  TAPESTRY_BLOCKCHAIN,
  TAPESTRY_EXECUTION,
} from '../lib/tapestry/client';
import { post } from '../lib/api';
import { getStaleFromCache, saveToCache } from '../lib/offline';
import { API_BASE_URL } from '../lib/api/config';

export interface TapestryProfileData {
  id: string;
  namespace: string;
  created_at: number;
  username: string;
  bio?: string | null;
  image?: string | null;
}

export interface TapestryProfileWithSocial {
  profile: TapestryProfileData;
  walletAddress?: string;
  socialCounts: {
    followers: number;
    following: number;
  };
}

export interface TapestryFollowProfile {
  id: string;
  namespace: string;
  created_at: number;
  username: string;
  bio?: string | null;
  image?: string | null;
}

export interface ProofEvent {
  id: string;
  profileId: string;
  contentType: 'proof_completion';
  text: string;
  challengeId: string;
  challengeTitle: string;
  dayNumber: number;
  totalDays: number;
  proofImageUrl?: string;
  earnedAmount?: number;
  createdAt: number;
  engagement: {
    likes: number;
    comments: number;
    hasLiked: boolean;
  };
  authorName?: string;
  authorAvatar?: string;
  authorUsername?: string;
}

const PROOF_EVENT_TYPE = 'proof_completion';

// ── Proof image URL resolution ──
// The backend stores relative paths in Tapestry (e.g. "26-02-26/abc.jpg").
// We resolve these to signed preview URLs so private bucket configuration
// doesn't break feed rendering.
let _proofStorageBase: string | null = null;
let _proofStorageBasePromise: Promise<string | null> | null = null;
const _signedProofPreviewCache = new Map<string, string>();

async function fetchProofStorageBase(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/storage/proof/public-base`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.baseUrl || null;
  } catch {
    return null;
  }
}

export function getProofStorageBase(): Promise<string | null> {
  if (_proofStorageBase) return Promise.resolve(_proofStorageBase);
  if (!_proofStorageBasePromise) {
    _proofStorageBasePromise = fetchProofStorageBase().then((base) => {
      _proofStorageBase = base;
      _proofStorageBasePromise = null;
      return base;
    });
  }
  return _proofStorageBasePromise;
}

/** Cache the base when we learn it from the signed upload URL (proofService). */
export function setProofStorageBase(base: string): void {
  _proofStorageBase = base;
}

function normalizeProofPath(path: string): string {
  return decodeURIComponent(path).replace(/^\/+/, '').trim();
}

function extractProofPath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (!/^https?:\/\//i.test(trimmed)) {
    return normalizeProofPath(trimmed);
  }

  try {
    const url = new URL(trimmed);
    const pathname = decodeURIComponent(url.pathname || '');
    const markers = [
      '/storage/v1/object/public/proof-submission/',
      '/storage/v1/object/sign/proof-submission/',
      '/storage/v1/object/upload/sign/proof-submission/',
    ];

    for (const marker of markers) {
      const idx = pathname.indexOf(marker);
      if (idx >= 0) {
        const path = pathname.slice(idx + marker.length);
        return normalizeProofPath(path);
      }
    }

    const pathFromQuery = url.searchParams.get('path');
    if (pathFromQuery) return normalizeProofPath(pathFromQuery);
  } catch {
    // Ignore URL parsing issues and fallback to raw handling.
  }

  return null;
}

async function getSignedProofPreviewUrl(path: string): Promise<string | null> {
  const normalizedPath = normalizeProofPath(path);
  if (!normalizedPath) return null;

  const cached = _signedProofPreviewCache.get(normalizedPath);
  if (cached) return cached;

  try {
    const response = await post<{ signedUrl?: string }>(
      '/storage/proof/signed-preview',
      { path: normalizedPath },
      true
    );
    const signedUrl = typeof response?.signedUrl === 'string' ? response.signedUrl : null;
    if (signedUrl) {
      _signedProofPreviewCache.set(normalizedPath, signedUrl);
    }
    return signedUrl;
  } catch {
    return null;
  }
}

async function resolveProofImageUrlForDisplay(raw: string | undefined): Promise<string | undefined> {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const extractedPath = extractProofPath(trimmed);

  if (extractedPath) {
    const signedPreview = await getSignedProofPreviewUrl(extractedPath);
    if (signedPreview) return signedPreview;

    if (_proofStorageBase) {
      return `${_proofStorageBase}${extractedPath}`;
    }
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

function toNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseProperties(raw: unknown): Record<string, string | number | boolean> {
  const properties: Record<string, string | number | boolean> = {};

  if (Array.isArray(raw)) {
    raw.forEach((property) => {
      if (!property || typeof property !== 'object') return;
      const key = (property as { key?: unknown }).key;
      const value = (property as { value?: unknown }).value;
      if (typeof key !== 'string' || value === undefined || value === null) return;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        properties[key] = value;
      }
    });
    return properties;
  }

  if (raw && typeof raw === 'object') {
    Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        properties[key] = value;
      }
    });
  }

  return properties;
}

function mapContentToProofEvent(rawItem: unknown): ProofEvent | null {
  const item = (rawItem || {}) as Record<string, any>;
  const content = (item.content || item) as Record<string, any>;
  const contentId = content?.id || item?.id;
  if (!contentId) return null;

  const properties = parseProperties(content?.properties ?? item?.properties ?? content);
  const rawType = String(
    properties.contentType ??
      properties.type ??
      properties.eventType ??
      ''
  )
    .trim()
    .toLowerCase();

  const challengeId = String(properties.challengeId ?? properties.challenge_id ?? '').trim();
  const dayNumber = toNumber(properties.dayNumber ?? properties.day_number, 0);
  const totalDays = toNumber(properties.totalDays ?? properties.total_days, 0);
  const challengeTitle = String(
    properties.challengeTitle ?? properties.challenge_title ?? ''
  ).trim();

  const looksLikeProofEvent = rawType === PROOF_EVENT_TYPE || (!!challengeId && dayNumber > 0);
  if (!looksLikeProofEvent) return null;

  const author = (item.authorProfile || item.author || {}) as Record<string, any>;
  const createdAt = toNumber(content?.created_at ?? properties.createdAt ?? properties.created_at, Date.now());
  const earnedAmountRaw = properties.earnedAmount ?? properties.earned_amount;
  const earnedAmount = earnedAmountRaw === undefined ? undefined : toNumber(earnedAmountRaw, 0);
  const textFromProperties = String(properties.text ?? '').trim();
  const fallbackText = `Completed Day ${dayNumber || '?'} of ${challengeTitle || 'challenge'}`;

  return {
    id: String(contentId),
    profileId: String(author?.id ?? properties.profileId ?? ''),
    contentType: PROOF_EVENT_TYPE,
    text: textFromProperties || fallbackText,
    challengeId,
    challengeTitle: challengeTitle || 'Challenge',
    dayNumber: dayNumber || 1,
    totalDays: totalDays || 1,
    proofImageUrl: typeof properties.proofImageUrl === 'string' ? properties.proofImageUrl : undefined,
    earnedAmount,
    createdAt,
    engagement: {
      likes: toNumber(item?.socialCounts?.likeCount, 0),
      comments: toNumber(item?.socialCounts?.commentCount, 0),
      hasLiked: Boolean(item?.requestingProfileSocialInfo?.hasLiked),
    },
    authorName: String(author?.bio ?? author?.username ?? 'User'),
    authorAvatar: typeof author?.image === 'string' ? author.image : undefined,
    authorUsername: typeof author?.username === 'string' ? author.username : undefined,
  };
}

export async function findOrCreateProfile(provenUser: {
  id: string;
  username: string;
  name: string;
  walletAddress: string | null;
  profilePicture: string;
}): Promise<TapestryProfileWithSocial> {
  const result = await tapestry.profiles.findOrCreateCreate(
    { apiKey: TAPESTRY_API_KEY },
    {
      id: provenUser.id,
      username: provenUser.username || provenUser.id,
      bio: provenUser.name,
      image: provenUser.profilePicture,
      walletAddress: provenUser.walletAddress || undefined,
      blockchain: TAPESTRY_BLOCKCHAIN,
      execution: TAPESTRY_EXECUTION,
      properties: [
        { key: 'provenUserId', value: provenUser.id },
        { key: 'avatar', value: provenUser.profilePicture || '' },
      ],
    }
  );

  const details = await getProfile(result.profile.id);
  if (details) return details;

  return {
    profile: result.profile,
    walletAddress: result.walletAddress,
    socialCounts: { followers: 0, following: 0 },
  };
}

export async function getProfile(profileId: string): Promise<TapestryProfileWithSocial | null> {
  try {
    const result = await tapestry.profiles.profilesDetail({
      id: profileId,
      apiKey: TAPESTRY_API_KEY,
    });
    return {
      profile: result.profile,
      walletAddress: result.walletAddress,
      socialCounts: result.socialCounts || { followers: 0, following: 0 },
    };
  } catch (error) {
    console.error('[Tapestry] Error fetching profile:', error);
    return null;
  }
}

export async function followUser(startId: string, endId: string): Promise<void> {
  await tapestry.followers.postFollowers({ apiKey: TAPESTRY_API_KEY }, { startId, endId });
}

export async function unfollowUser(startId: string, endId: string): Promise<void> {
  await tapestry.followers.removeCreate({ apiKey: TAPESTRY_API_KEY }, { startId, endId });
}

export async function getFollowCounts(
  profileId: string
): Promise<{ followers: number; following: number }> {
  const profile = await getProfile(profileId);
  return profile?.socialCounts || { followers: 0, following: 0 };
}

export async function getFollowing(
  profileId: string,
  page: number = 1,
  pageSize: number = 50
): Promise<{ profiles: TapestryFollowProfile[]; page: number; pageSize: number }> {
  try {
    const result = await tapestry.profiles.followingList({
      id: profileId,
      apiKey: TAPESTRY_API_KEY,
      page: String(page),
      pageSize: String(pageSize),
    });

    return {
      profiles: (result.profiles || []) as TapestryFollowProfile[],
      page: result.page || page,
      pageSize: result.pageSize || pageSize,
    };
  } catch (error) {
    console.error('[Tapestry] Error fetching following:', error);
    return { profiles: [], page, pageSize };
  }
}

export async function getFollowers(
  profileId: string,
  page: number = 1,
  pageSize: number = 50
): Promise<{ profiles: TapestryFollowProfile[]; page: number; pageSize: number }> {
  try {
    const result = await tapestry.profiles.followersList({
      id: profileId,
      apiKey: TAPESTRY_API_KEY,
      page: String(page),
      pageSize: String(pageSize),
    });

    return {
      profiles: (result.profiles || []) as TapestryFollowProfile[],
      page: result.page || page,
      pageSize: result.pageSize || pageSize,
    };
  } catch (error) {
    console.error('[Tapestry] Error fetching followers:', error);
    return { profiles: [], page, pageSize };
  }
}

export async function getAllProfiles(): Promise<TapestryProfileWithSocial[]> {
  try {
    const result = await tapestry.profiles.profilesList({
      apiKey: TAPESTRY_API_KEY,
      pageSize: '50',
    });
    return ((result as any).profiles || []).map((entry: any) => ({
      profile: entry.profile,
      walletAddress: entry.walletAddress || entry.wallet?.address,
      socialCounts: entry.socialCounts || { followers: 0, following: 0 },
    }));
  } catch (error) {
    console.error('[Tapestry] Error fetching all profiles:', error);
    return [];
  }
}

export async function searchProfiles(query: string): Promise<TapestryProfileWithSocial[]> {
  try {
    const result = await tapestry.search.profilesList({
      apiKey: TAPESTRY_API_KEY,
      query,
    });
    return ((result as any).profiles || []).map((entry: any) => ({
      profile: entry.profile || entry,
      walletAddress: entry.walletAddress || entry.wallet?.address,
      socialCounts: entry.socialCounts || { followers: 0, following: 0 },
    }));
  } catch (error) {
    console.error('[Tapestry] Error searching profiles:', error);
    return [];
  }
}

export async function getAllFollowingIds(profileId: string): Promise<string[]> {
  const ids: string[] = [];
  let page = 1;
  const pageSize = 50;
  let hasMore = true;

  while (hasMore) {
    const result = await getFollowing(profileId, page, pageSize);
    result.profiles.forEach((profile) => ids.push(profile.id));
    hasMore = result.profiles.length === pageSize;
    page += 1;
  }

  return ids;
}

export async function postProofEvent(
  profileId: string,
  challengeTitle: string,
  dayNumber: number,
  totalDays: number,
  challengeId: string,
  proofImageUrl?: string,
  earnedAmount?: number
): Promise<ProofEvent | null> {
  if (!profileId || !challengeId || !TAPESTRY_API_KEY) return null;

  const eventId = `proof:${profileId}:${challengeId}:${dayNumber}`;
  const properties: { key: string; value: string | number | boolean }[] = [
    { key: 'type', value: PROOF_EVENT_TYPE },
    { key: 'contentType', value: PROOF_EVENT_TYPE },
    { key: 'challengeId', value: challengeId },
    { key: 'challengeTitle', value: challengeTitle },
    { key: 'dayNumber', value: dayNumber },
    { key: 'totalDays', value: totalDays },
    { key: 'text', value: `Completed Day ${dayNumber} of ${challengeTitle}` },
  ];

  if (proofImageUrl) {
    properties.push({ key: 'proofImageUrl', value: proofImageUrl });
  }
  if (typeof earnedAmount === 'number' && Number.isFinite(earnedAmount)) {
    properties.push({ key: 'earnedAmount', value: Number(earnedAmount.toFixed(2)) });
  }

  try {
    const content = await tapestry.contents.findOrCreateCreate(
      { apiKey: TAPESTRY_API_KEY },
      {
        id: eventId,
        profileId,
        properties,
      }
    );

    const details = await tapestry.contents.contentsDetail({
      apiKey: TAPESTRY_API_KEY,
      id: content.id,
      requestingProfileId: profileId,
    });

    return (
      mapContentToProofEvent(details as unknown) || {
        id: content.id,
        profileId,
        contentType: PROOF_EVENT_TYPE,
        text: `Completed Day ${dayNumber} of ${challengeTitle}`,
        challengeId,
        challengeTitle,
        dayNumber,
        totalDays,
        proofImageUrl,
        earnedAmount,
        createdAt: Date.now(),
        engagement: {
          likes: 0,
          comments: 0,
          hasLiked: false,
        },
      }
    );
  } catch (error) {
    console.error('[Tapestry] Error posting proof event:', error);
    return null;
  }
}

export async function getUserProofEvents(
  profileId: string,
  requestingProfileId?: string,
  limit: number = 20,
  offset: number = 0
): Promise<ProofEvent[]> {
  if (!profileId || !TAPESTRY_API_KEY) return [];

  const safeLimit = Math.max(1, limit);
  const page = Math.floor(Math.max(0, offset) / safeLimit) + 1;

  try {
    const result = await tapestry.contents.contentsList({
      apiKey: TAPESTRY_API_KEY,
      profileId,
      requestingProfileId,
      orderByField: 'created_at',
      orderByDirection: 'DESC',
      page: String(page),
      pageSize: String(safeLimit),
    });

    const baseEvents = (result.contents || [])
      .map((entry) => mapContentToProofEvent(entry as unknown))
      .filter((entry): entry is ProofEvent => Boolean(entry))
      .sort((a, b) => b.createdAt - a.createdAt);

    const resolvedEvents = await Promise.all(
      baseEvents.map(async (event) => {
        const resolvedProofImageUrl = await resolveProofImageUrlForDisplay(event.proofImageUrl);
        if (resolvedProofImageUrl === event.proofImageUrl) return event;
        return { ...event, proofImageUrl: resolvedProofImageUrl };
      })
    );

    return resolvedEvents;
  } catch (error) {
    console.error('[Tapestry] Error fetching user proof events:', error);
    return [];
  }
}

export async function getActivityFeed(
  profileId: string,
  followingIds: string[],
  limit: number = 50
): Promise<ProofEvent[]> {
  if (!profileId || !TAPESTRY_API_KEY) return [];

  const cacheId = profileId;
  const ids = Array.from(new Set([profileId, ...(followingIds || [])].filter(Boolean)));
  if (ids.length === 0) return [];

  // Ensure we have the storage base URL for resolving proof image paths
  await getProofStorageBase();

  const perProfileLimit = Math.max(10, Math.ceil(limit / ids.length) * 2);

  try {
    const results = await Promise.allSettled(
      ids.map((id) => getUserProofEvents(id, profileId, perProfileLimit))
    );

    const merged = results
      .filter(
        (result): result is PromiseFulfilledResult<ProofEvent[]> =>
          result.status === 'fulfilled'
      )
      .flatMap((result) => result.value);

    const deduped = Array.from(
      merged.reduce((map, event) => map.set(event.id, event), new Map<string, ProofEvent>()).values()
    );

    const sorted = deduped
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.max(1, limit));

    await saveToCache('tapestryFeed', sorted, cacheId);
    return sorted;
  } catch (error) {
    console.error('[Tapestry] Error fetching activity feed:', error);
    const stale = await getStaleFromCache<ProofEvent[]>('tapestryFeed', cacheId);
    return stale?.data || [];
  }
}

export async function likeContent(profileId: string, contentId: string): Promise<void> {
  if (!profileId || !contentId || !TAPESTRY_API_KEY) return;
  await tapestry.likes.likesCreate(
    { apiKey: TAPESTRY_API_KEY, nodeId: contentId },
    { startId: profileId }
  );
}

export async function unlikeContent(profileId: string, contentId: string): Promise<void> {
  if (!profileId || !contentId || !TAPESTRY_API_KEY) return;
  await tapestry.likes.likesDelete(
    { apiKey: TAPESTRY_API_KEY, nodeId: contentId },
    { startId: profileId }
  );
}

export async function checkLikeStatus(profileId: string, contentId: string): Promise<boolean> {
  if (!profileId || !contentId || !TAPESTRY_API_KEY) return false;

  try {
    const details = await tapestry.contents.contentsDetail({
      apiKey: TAPESTRY_API_KEY,
      id: contentId,
      requestingProfileId: profileId,
    });
    return Boolean((details as any)?.requestingProfileSocialInfo?.hasLiked);
  } catch (error) {
    console.error('[Tapestry] Error checking like status:', error);
    return false;
  }
}

export async function getLikeCount(contentId: string): Promise<number> {
  if (!contentId || !TAPESTRY_API_KEY) return 0;

  try {
    const details = await tapestry.contents.contentsDetail({
      apiKey: TAPESTRY_API_KEY,
      id: contentId,
    });
    return toNumber((details as any)?.socialCounts?.likeCount, 0);
  } catch (error) {
    console.error('[Tapestry] Error fetching like count:', error);
    return 0;
  }
}

// ═══════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════

export interface CommentData {
  id: string;
  text: string;
  createdAt: number;
  authorId: string;
  authorUsername: string;
  authorName: string;
  authorAvatar?: string;
}

function mapCommentEntry(entry: any): CommentData | null {
  const comment = entry?.comment;
  if (!comment?.id) return null;
  const author = entry?.authorProfile || {};
  return {
    id: comment.id,
    text: comment.text || '',
    createdAt: toNumber(comment.created_at, Date.now()),
    authorId: String(author.id || ''),
    authorUsername: String(author.username || ''),
    authorName: String(author.bio || author.username || 'User'),
    authorAvatar: typeof author.image === 'string' ? author.image : undefined,
  };
}

export async function getComments(
  contentId: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<{ comments: CommentData[]; page: number; pageSize: number }> {
  if (!contentId || !TAPESTRY_API_KEY) return { comments: [], page, pageSize };

  try {
    const result = await tapestry.comments.commentsList({
      apiKey: TAPESTRY_API_KEY,
      contentId,
      page: String(page),
      pageSize: String(pageSize),
    });

    const comments = (result.comments || [])
      .map(mapCommentEntry)
      .filter((c): c is CommentData => c !== null);

    return { comments, page: (result as any).page || page, pageSize: (result as any).pageSize || pageSize };
  } catch (error) {
    console.error('[Tapestry] Error fetching comments:', error);
    return { comments: [], page, pageSize };
  }
}

export async function postComment(
  contentId: string,
  profileId: string,
  text: string,
): Promise<CommentData | null> {
  if (!contentId || !profileId || !text.trim() || !TAPESTRY_API_KEY) return null;

  try {
    const result = await tapestry.comments.commentsCreate(
      { apiKey: TAPESTRY_API_KEY },
      { contentId, profileId, text: text.trim() },
    );

    return {
      id: result.id,
      text: result.text || text.trim(),
      createdAt: toNumber(result.created_at, Date.now()),
      authorId: profileId,
      authorUsername: '',
      authorName: '',
    };
  } catch (error) {
    console.error('[Tapestry] Error posting comment:', error);
    return null;
  }
}

export async function deleteComment(commentId: string): Promise<void> {
  if (!commentId || !TAPESTRY_API_KEY) return;
  await tapestry.comments.commentsDelete({ apiKey: TAPESTRY_API_KEY, id: commentId });
}
