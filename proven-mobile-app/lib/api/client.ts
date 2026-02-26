/**
 * API Client for Proven Mobile App
 * Handles all HTTP requests with authentication, retry logic, and offline support
 */

import { getApiUrl } from './config';
import { getAuthToken } from './auth';
import { checkIsOnline } from '../../hooks/useNetworkStatus';
import {
  saveToCache,
  getFromCache,
  getStaleFromCache,
  queueRequest,
  CacheKey,
} from '../offline';

function isValidTimeZone(value: unknown): value is string {
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

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

// Request timeout
const DEFAULT_TIMEOUT_MS = 15000;

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: Record<string, unknown> | FormData;
  requiresAuth?: boolean;
}

interface CachedRequestOptions extends RequestOptions {
  /** Cache key type for automatic caching */
  cacheKey?: CacheKey;
  /** Optional ID to make cache key unique (e.g., challenge ID) */
  cacheId?: string;
  /** If true, return stale cache on network failure */
  useStaleOnError?: boolean;
  /** If true and offline, queue this mutation for later */
  queueable?: boolean;
  /** Type of queued request for categorization */
  queueType?: 'proofSubmission' | 'profileUpdate' | 'generic';
  /** Skip retries for this request */
  skipRetry?: boolean;
  /** Custom timeout in ms */
  timeoutMs?: number;
  /** Force refresh (bypass cache) */
  forceRefresh?: boolean;
}

/**
 * Custom error for offline queued requests
 */
export class OfflineQueuedError extends Error {
  constructor(message: string = 'Your changes will sync when you\'re back online') {
    super(message);
    this.name = 'OfflineQueuedError';
  }
}

/**
 * Custom error for network issues
 */
export class NetworkError extends Error {
  public isOffline: boolean;
  public isTimeout: boolean;

  constructor(message: string, options: { isOffline?: boolean; isTimeout?: boolean } = {}) {
    super(message);
    this.name = 'NetworkError';
    this.isOffline = options.isOffline ?? false;
    this.isTimeout = options.isTimeout ?? false;
  }
}

/**
 * Wait for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate retry delay with exponential backoff
 */
function getRetryDelay(attempt: number): number {
  const delay = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  // Add jitter (±20%)
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, RETRY_CONFIG.maxDelayMs);
}

/**
 * Create an AbortController with timeout
 */
function createTimeoutController(timeoutMs: number): { controller: AbortController; timeoutId: ReturnType<typeof setTimeout> } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

/**
 * Make an API request with retry logic and offline support
 */
export async function apiRequest<T>(
  endpoint: string,
  options: CachedRequestOptions = {}
): Promise<T> {
  const {
    body,
    requiresAuth = true,
    cacheKey,
    cacheId,
    useStaleOnError = true,
    queueable = false,
    queueType = 'generic',
    skipRetry = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    forceRefresh = false,
    ...fetchOptions
  } = options;

  const method = fetchOptions.method || 'GET';
  const isGetRequest = method === 'GET';

  // Check if online
  const online = await checkIsOnline();

  // For GET requests, try fresh cache first (unless forceRefresh is true)
  if (isGetRequest && cacheKey && !forceRefresh) {
    const cached = await getFromCache<T>(cacheKey, cacheId);
    if (cached) {
      console.log(`[Cache] Serving fresh cached data for ${endpoint}`);
      return cached;
    }
  }

  // For GET requests when offline, try stale cache
  if (isGetRequest && !online && cacheKey) {
    if (useStaleOnError) {
      const stale = await getStaleFromCache<T>(cacheKey, cacheId);
      if (stale) {
        console.log(`[Offline] Serving stale cached data for ${endpoint}`);
        return stale.data;
      }
    }

    throw new NetworkError(
      'You\'re offline and this data isn\'t available yet. Please try again when connected.',
      { isOffline: true }
    );
  }

  // For mutations when offline, queue if allowed
  if (!isGetRequest && !online && queueable) {
    await queueRequest({
      endpoint,
      method: method as 'POST' | 'PUT' | 'DELETE',
      body: body as Record<string, unknown>,
      timestamp: Date.now(),
      type: queueType,
    });
    throw new OfflineQueuedError();
  }

  // Build headers
  const headers: Record<string, string> = {
    'X-Client-Type': 'proven-app',
    ...(fetchOptions.headers as Record<string, string>),
  };

  const { timeZone, dateKey, offsetMinutes } = getClientTimeContext();
  headers['X-Local-Date-Key'] = dateKey;
  headers['X-UTC-Offset-Minutes'] = String(offsetMinutes);
  if (timeZone) {
    headers['X-Timezone'] = timeZone;
  }

  if (requiresAuth) {
    try {
      const token = await getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (error) {
      console.warn('Failed to get auth token:', error);
    }
  }

  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const url = getApiUrl(endpoint);
  const maxRetries = skipRetry ? 0 : RETRY_CONFIG.maxRetries;

  let lastError: Error | null = null;

  // Retry loop
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { controller, timeoutId } = createTimeoutController(timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const result = await response.json();

      if (!response.ok) {
        // Check if retryable
        if (RETRY_CONFIG.retryableStatuses.includes(response.status) && attempt < maxRetries) {
          console.log(`[API] Retrying ${endpoint} (attempt ${attempt + 1}/${maxRetries})`);
          await delay(getRetryDelay(attempt));
          continue;
        }
        throw new Error(result.message || result.error || `Request failed with status ${response.status}`);
      }

      // Success - cache the result if applicable
      const data = result.data !== undefined ? result.data : result;

      if (isGetRequest && cacheKey) {
        saveToCache(cacheKey, data, cacheId).catch(err =>
          console.warn('Failed to cache response:', err)
        );
      }

      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      lastError = error;

      // Handle abort (timeout)
      if (error.name === 'AbortError') {
        if (attempt < maxRetries) {
          console.log(`[API] Request timeout, retrying ${endpoint} (attempt ${attempt + 1}/${maxRetries})`);
          await delay(getRetryDelay(attempt));
          continue;
        }
        lastError = new NetworkError('Request timed out. Please check your connection.', { isTimeout: true });
      }

      // Handle network errors
      if (error.message === 'Network request failed' || error.name === 'TypeError') {
        if (attempt < maxRetries) {
          console.log(`[API] Network error, retrying ${endpoint} (attempt ${attempt + 1}/${maxRetries})`);
          await delay(getRetryDelay(attempt));
          continue;
        }
        lastError = new NetworkError('Unable to connect. Please check your internet connection.', { isOffline: true });
      }

      // Don't retry other errors
      if (!(error instanceof NetworkError)) {
        break;
      }
    }
  }

  // All retries failed - try stale cache for GET requests
  if (isGetRequest && useStaleOnError && cacheKey) {
    const stale = await getStaleFromCache<T>(cacheKey, cacheId);
    if (stale) {
      console.log(`[API] Serving stale data after network failure for ${endpoint}`);
      return stale.data;
    }
  }

  throw lastError || new Error('Request failed');
}

/**
 * GET request helper with caching support
 */
export async function get<T>(
  endpoint: string,
  requiresAuth = true,
  cacheOptions?: { cacheKey?: CacheKey; cacheId?: string; forceRefresh?: boolean }
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'GET',
    requiresAuth,
    ...cacheOptions,
  });
}

/**
 * POST request helper
 */
export async function post<T>(
  endpoint: string,
  body?: Record<string, unknown>,
  requiresAuth = true,
  offlineOptions?: { queueable?: boolean; queueType?: 'proofSubmission' | 'profileUpdate' | 'generic' }
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body,
    requiresAuth,
    ...offlineOptions,
  });
}

/**
 * PUT request helper
 */
export async function put<T>(
  endpoint: string,
  body?: Record<string, unknown>,
  requiresAuth = true,
  offlineOptions?: { queueable?: boolean; queueType?: 'proofSubmission' | 'profileUpdate' | 'generic' }
): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'PUT',
    body,
    requiresAuth,
    ...offlineOptions,
  });
}

/**
 * DELETE request helper
 */
export async function del<T>(
  endpoint: string,
  body?: Record<string, unknown>,
  requiresAuth = true
): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'DELETE', body, requiresAuth });
}
