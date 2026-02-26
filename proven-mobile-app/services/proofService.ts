/**
 * Proof Service - API calls for proof submissions with offline support
 */

import * as FileSystem from 'expo-file-system/legacy';
import { get, post, NetworkError } from '../lib/api';
import { API_ENDPOINTS, getApiUrl } from '../lib/api/config';
import { getStaleFromCache, invalidateCache, saveToCache } from '../lib/offline';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkIsOnline } from '../hooks/useNetworkStatus';
import { getAuthToken } from '../lib/api/auth';
import { postProofEvent, setProofStorageBase } from './tapestryService';

const PENDING_PROOF_PREFIX = '@proven_pending_proof:';

function isValidTimeZone(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getClientTimeContext(referenceDate: Date = new Date()): {
  timeZone?: string;
  dateKey: string;
  offsetMinutes: number;
} {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');
  const dateKey = `${year}-${month}-${day}`;
  const offsetMinutes = referenceDate.getTimezoneOffset();

  let timeZone: string | undefined;
  try {
    const candidate = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidTimeZone(candidate)) {
      timeZone = candidate;
    }
  } catch {
    // Ignore and rely on offset + dateKey.
  }

  return { timeZone, dateKey, offsetMinutes };
}

export interface ProofSubmission {
  id: string;
  imageUrl: string;
  description?: string;
  submissionDate: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewComments?: string;
  reviewedAt?: string;
}

export interface CalendarDay {
  dayNumber: number;
  date: string;
  dayOfWeek: number;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  status: 'not_submitted' | 'submitted' | 'approved' | 'rejected' | 'locked';
  submission: ProofSubmission | null;
  payout: { amount: number; transactionSignature: string } | null;
  canSubmit: boolean;
}

export interface ChallengeCalendar {
  challenge: {
    id: string;
    title: string;
    startDate: string;
    endDate: string;
    duration: string;
    challengeTimezone?: string;
  };
  userChallenge: {
    id: string;
    progress: number;
    stakeAmount: number;
  };
  calendar: CalendarDay[];
  statistics: {
    totalDays: number;
    submittedDays: number;
    approvedDays: number;
    rejectedDays: number;
    missedDays: number;
    completionRate: number;
  };
}

export interface PendingProof {
  userChallengeId: string;
  challengeId?: string;
  localImageUri: string;
  description?: string;
  timestamp: number;
  status: 'pending' | 'uploading' | 'failed';
  error?: string;
}

export interface SubmitProofResult {
  success: boolean;
  message: string;
  pending?: boolean;
  alreadySubmitted?: boolean;
}

export interface ProofSocialEventOptions {
  tapestryProfileId?: string | null;
  challengeTitle?: string;
  dayNumber?: number;
  totalDays?: number;
  earnedAmount?: number;
}

type SignedUploadResponse = {
  signedUrl?: string;
  uploadUrl?: string;
  path?: string;
  filePath?: string;
  token?: string;
};

type ProxyUploadResponse = {
  path?: string;
  filePath?: string;
};

type MinimalUserChallengeRef = {
  id?: string;
  challengeId?: string;
  challenge?: {
    id?: string;
  };
};

type ChallengeUserResponse = {
  userChallenges?: MinimalUserChallengeRef[];
  active?: MinimalUserChallengeRef[];
  completed?: MinimalUserChallengeRef[];
};

function getErrorMessage(error: Error | { message?: string } | string | null | undefined): string {
  if (!error) return 'Request failed';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error.message === 'string') return error.message;
  return 'Request failed';
}

/**
 * Get challenge calendar with submission history (cached)
 */
export async function getChallengeCalendar(
  challengeId: string,
  options?: { forceRefresh?: boolean }
): Promise<ChallengeCalendar | null> {
  const forceRefresh = options?.forceRefresh ?? false;
  const { timeZone, dateKey, offsetMinutes } = getClientTimeContext();
  const params = new URLSearchParams();
  if (timeZone) params.set('tz', timeZone);
  params.set('dateKey', dateKey);
  params.set('offsetMinutes', String(offsetMinutes));
  const url = `${API_ENDPOINTS.SUBMISSION_CALENDAR(challengeId)}?${params.toString()}`;

  try {
    if (forceRefresh) {
      const freshCalendar = await get<ChallengeCalendar>(url, true);
      await saveToCache('challengeCalendar', freshCalendar, challengeId);
      return freshCalendar;
    }

    return await get<ChallengeCalendar>(url, true, {
      cacheKey: 'challengeCalendar',
      cacheId: challengeId,
    });
  } catch (error) {
    if (error instanceof NetworkError) {
      const stale = await getStaleFromCache<ChallengeCalendar>('challengeCalendar', challengeId);
      if (stale) {
        console.log('[Proof] Returning cached calendar');
        return stale.data;
      }
    }
    console.error('Error fetching challenge calendar:', error);
    return null;
  }
}

/**
 * Submit daily proof for a challenge
 */
export async function submitProof(
  userChallengeId: string,
  imagePath: string,
  description?: string,
  challengeId?: string
): Promise<SubmitProofResult> {
  try {
    const { timeZone, dateKey, offsetMinutes } = getClientTimeContext();
    await post(API_ENDPOINTS.SUBMISSION_SUBMIT, {
      userChallengeId,
      imageUrl: imagePath,
      imagePath,
      description,
      ...(timeZone ? { tz: timeZone } : {}),
      dateKey,
      offsetMinutes,
    });

    await invalidateCache('userChallenges');
    if (challengeId) {
      await invalidateCache('challengeCalendar', challengeId);
    }

    return { success: true, message: 'Proof submitted successfully!' };
  } catch (error) {
    const message = getErrorMessage(
      error instanceof Error || typeof error === 'string'
        ? error
        : (error as { message?: string })
    ) || 'Failed to submit proof';
    const alreadySubmitted = /already submitted/i.test(message);

    if (alreadySubmitted && challengeId) {
      await invalidateCache('challengeCalendar', challengeId);
    }

    return { success: false, message, alreadySubmitted };
  }
}

/**
 * Get signed URL for uploading proof image
 */
export async function getSignedUploadUrl(
  challengeId: string,
  contentType: string
): Promise<{ uploadUrl: string; filePath: string; token?: string }> {
  const response = await post<SignedUploadResponse>(API_ENDPOINTS.STORAGE_PROOF_SIGNED_UPLOAD, {
    challengeId,
    contentType,
  });

  const uploadUrl = response?.signedUrl || response?.uploadUrl;
  const filePath = response?.path || response?.filePath;

  if (!uploadUrl || !filePath) {
    throw new Error('Failed to prepare proof upload. Please try again.');
  }

  return {
    uploadUrl,
    filePath,
    token: response?.token,
  };
}

async function uploadProofViaBackendProxy(
  challengeId: string,
  imageUri: string,
  contentType: string
): Promise<{ filePath: string }> {
  const imageBase64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!imageBase64) {
    throw new Error('Unable to read selected image for upload.');
  }

  const token = await getAuthToken();
  if (!token) {
    throw new Error('Authentication required. Please sign in again.');
  }

  const response = await fetch(getApiUrl(API_ENDPOINTS.STORAGE_PROOF_PROXY_UPLOAD), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Client-Type': 'proven-app',
    },
    body: JSON.stringify({
      challengeId,
      contentType,
      imageBase64,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message || `Proxy upload failed (${response.status})`;
    throw new Error(message);
  }

  const data: ProxyUploadResponse | undefined = payload?.data || payload;
  const filePath = data?.path || data?.filePath;

  if (!filePath) {
    throw new Error('Proof upload completed but no file path was returned.');
  }

  return { filePath };
}

async function resolveChallengeIdFromUserChallenge(userChallengeId: string): Promise<string | null> {
  try {
    const response = await get<ChallengeUserResponse | MinimalUserChallengeRef[]>(API_ENDPOINTS.CHALLENGE_USER, true);

    const userChallenges: MinimalUserChallengeRef[] = Array.isArray(response)
      ? response
      : Array.isArray(response?.userChallenges)
        ? response.userChallenges
        : [...(response?.active || []), ...(response?.completed || [])];

    const matched = userChallenges.find((userChallenge) => userChallenge?.id === userChallengeId);
    return matched?.challengeId || matched?.challenge?.id || null;
  } catch (error) {
    return null;
  }
}

/**
 * Copy image to a persistent location so it survives app restarts
 */
async function persistImage(imageUri: string, userChallengeId: string): Promise<string> {
  try {
    const proofDir = `${FileSystem.documentDirectory}pending_proofs/`;
    const dirInfo = await FileSystem.getInfoAsync(proofDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(proofDir, { intermediates: true });
    }

    const filename = `proof_${userChallengeId}_${Date.now()}.jpg`;
    const destUri = `${proofDir}${filename}`;

    await FileSystem.copyAsync({ from: imageUri, to: destUri });
    return destUri;
  } catch (error) {
    console.warn('Failed to persist image, using original URI:', error);
    return imageUri;
  }
}

/**
 * Delete persisted image after successful upload
 */
async function deletePersistedImage(imageUri: string): Promise<void> {
  try {
    if (imageUri.startsWith(FileSystem.documentDirectory || '')) {
      const info = await FileSystem.getInfoAsync(imageUri);
      if (info.exists) {
        await FileSystem.deleteAsync(imageUri, { idempotent: true });
      }
    }
  } catch (error) {
    console.warn('Failed to delete persisted image:', error);
  }
}

/**
 * Save pending proof to local storage (for offline queue)
 */
async function savePendingProof(proof: PendingProof): Promise<void> {
  const key = `${PENDING_PROOF_PREFIX}${proof.userChallengeId}`;
  await AsyncStorage.setItem(key, JSON.stringify(proof));
}

/**
 * Get pending proof from local storage
 */
export async function getPendingProof(userChallengeId: string): Promise<PendingProof | null> {
  try {
    const key = `${PENDING_PROOF_PREFIX}${userChallengeId}`;
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (error) {
    console.warn('Error getting pending proof:', error);
  }
  return null;
}

/**
 * Get all pending proofs (for sync status display)
 */
export async function getAllPendingProofs(): Promise<PendingProof[]> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const proofKeys = allKeys.filter(k => k.startsWith(PENDING_PROOF_PREFIX));

    if (proofKeys.length === 0) return [];

    const values = await AsyncStorage.multiGet(proofKeys);
    return values
      .map(([, value]) => value ? JSON.parse(value) : null)
      .filter(Boolean) as PendingProof[];
  } catch (error) {
    console.warn('Error getting pending proofs:', error);
    return [];
  }
}

/**
 * Upload proof image and submit with offline support
 */
export async function uploadAndSubmitProof(
  userChallengeId: string,
  imageUri: string,
  description?: string,
  challengeId?: string,
  socialEvent?: ProofSocialEventOptions
): Promise<SubmitProofResult> {
  const timestamp = Date.now();
  const contentType = 'image/jpeg';
  let resolvedChallengeId: string | null | undefined = challengeId;

  const isOnline = await checkIsOnline();

  if (!isOnline) {
    const persistedUri = await persistImage(imageUri, userChallengeId);
    await savePendingProof({
      userChallengeId,
      challengeId,
      localImageUri: persistedUri,
      description,
      timestamp,
      status: 'pending',
    });

    return {
      success: true,
      message: 'Proof saved! It will upload when you\'re back online.',
      pending: true,
    };
  }

  try {
    resolvedChallengeId = resolvedChallengeId || (await resolveChallengeIdFromUserChallenge(userChallengeId));
    if (!resolvedChallengeId) {
      return {
        success: false,
        message: 'Unable to identify this challenge. Please reopen the challenge and try again.',
      };
    }

    const signedUrlData = await getSignedUploadUrl(resolvedChallengeId, contentType);
    const imageResponse = await fetch(imageUri);
    if (!imageResponse.ok) {
      return { success: false, message: 'Unable to read the selected image. Please try a new photo.' };
    }
    const imageBlob = await imageResponse.blob();
    let uploadedFilePath = signedUrlData.filePath;

    // Derive the public image URL from the signed upload URL.
    // Supabase createSignedUploadUrl returns:
    //   https://[ref].supabase.co/storage/v1/object/upload/sign/proof-submission/[path]?token=...
    // The public URL is:
    //   https://[ref].supabase.co/storage/v1/object/public/proof-submission/[path]
    // Build the public storage base (without the file path) from the signed URL.
    // Then we can append any filePath to get the public URL.
    function getPublicStorageBase(signedUrl: string, originalPath: string): string | null {
      try {
        const urlNoQuery = signedUrl.split('?')[0];
        // Remove the file path suffix to get the base
        const idx = urlNoQuery.indexOf(originalPath);
        if (idx < 0) return null;
        const base = urlNoQuery.slice(0, idx);
        // Replace /upload/sign/ or /sign/ with /public/
        return base
          .replace('/object/upload/sign/', '/object/public/')
          .replace('/object/sign/', '/object/public/');
      } catch { /* ignore */ }
      return null;
    }
    const publicStorageBase = getPublicStorageBase(signedUrlData.uploadUrl, signedUrlData.filePath);
    if (publicStorageBase) {
      setProofStorageBase(publicStorageBase);
    }

    try {
      const uploadResult = await fetch(signedUrlData.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          ...(signedUrlData.token ? { 'x-upsert': 'true' } : {}),
        },
        body: imageBlob,
      });

      if (!uploadResult.ok) {
        throw new Error(`Direct upload failed with status ${uploadResult.status}`);
      }
    } catch (directUploadError) {
      console.warn('[Proof] Direct signed upload failed. Falling back to backend proxy upload.', directUploadError);
      const proxyUpload = await uploadProofViaBackendProxy(resolvedChallengeId, imageUri, contentType);
      uploadedFilePath = proxyUpload.filePath;
    }

    const result = await submitProof(
      userChallengeId,
      uploadedFilePath,
      description,
      resolvedChallengeId || undefined
    );

    if (result.success) {
      const tapestryProfileId = socialEvent?.tapestryProfileId || null;
      if (tapestryProfileId && resolvedChallengeId && !result.pending) {
        const challengeTitle = socialEvent?.challengeTitle || 'Challenge';
        const dayNumber = Math.max(1, socialEvent?.dayNumber || 1);
        const totalDays = Math.max(dayNumber, socialEvent?.totalDays || dayNumber);

        // Build full public image URL for the social feed
        const publicImageUrl = publicStorageBase
          ? `${publicStorageBase}${uploadedFilePath}`
          : undefined;

        // Fire-and-forget social post: never block proof submission UX.
        void postProofEvent(
          tapestryProfileId,
          challengeTitle,
          dayNumber,
          totalDays,
          resolvedChallengeId,
          publicImageUrl,
          socialEvent?.earnedAmount
        ).catch((error) => {
          console.warn('[Proof] Failed to post proof event to Tapestry:', error);
        });
      }

      await clearPendingProof(userChallengeId);
    }

    return result;
  } catch (error) {
    console.error('Upload proof error:', error);
    const errorMessage = getErrorMessage(
      error instanceof Error || typeof error === 'string'
        ? error
        : (error as { message?: string })
    );

    if (
      error instanceof NetworkError ||
      errorMessage.includes('Network') ||
      errorMessage.includes('fetch')
    ) {
      const persistedUri = await persistImage(imageUri, userChallengeId);
      await savePendingProof({
        userChallengeId,
        challengeId: resolvedChallengeId || undefined,
        localImageUri: persistedUri,
        description,
        timestamp,
        status: 'pending',
      });

      return {
        success: true,
        message: 'You\'re offline. Your proof is saved and will upload when you\'re back online.',
        pending: true,
      };
    }

    return { success: false, message: errorMessage || 'Failed to upload and submit proof' };
  }
}

/**
 * Retry uploading pending proofs
 */
export async function retryPendingProofs(): Promise<{ success: number; failed: number }> {
  const pendingProofs = await getAllPendingProofs();

  if (pendingProofs.length === 0) {
    return { success: 0, failed: 0 };
  }

  console.log(`[ProofService] Retrying ${pendingProofs.length} pending proofs`);

  let success = 0;
  let failed = 0;

  for (const proof of pendingProofs) {
    try {
      const imageInfo = await FileSystem.getInfoAsync(proof.localImageUri);
      if (!imageInfo.exists) {
        console.warn(`[ProofService] Pending proof image no longer exists: ${proof.localImageUri}`);
        await clearPendingProof(proof.userChallengeId);
        failed++;
        continue;
      }

      const result = await uploadAndSubmitProof(
        proof.userChallengeId,
        proof.localImageUri,
        proof.description,
        proof.challengeId
      );

      if (result.success && !result.pending) {
        await deletePersistedImage(proof.localImageUri);
        success++;
      } else if (!result.success) {
        failed++;
      }
    } catch (error) {
      console.error(`[ProofService] Failed to retry proof for ${proof.userChallengeId}:`, error);
      failed++;
    }
  }

  return { success, failed };
}

/**
 * Clear pending proof and its associated image
 */
async function clearPendingProof(userChallengeId: string): Promise<void> {
  try {
    const pending = await getPendingProof(userChallengeId);
    if (pending) {
      await deletePersistedImage(pending.localImageUri);
    }
  } catch (error) {
    console.warn('Error cleaning up pending proof image:', error);
  }

  const key = `${PENDING_PROOF_PREFIX}${userChallengeId}`;
  await AsyncStorage.removeItem(key);
}
