/**
 * Offline Store - AsyncStorage-based cache layer for offline support
 * 
 * Provides:
 * - Type-safe caching with keys
 * - TTL-based expiration
 * - LRU eviction when storage is full
 * - Version-based invalidation
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Cache version - increment to invalidate all caches on app update
const CACHE_VERSION = 1;
const CACHE_PREFIX = `@proven_cache_v${CACHE_VERSION}:`;
const CACHE_METADATA_KEY = `${CACHE_PREFIX}__metadata__`;

// Cache configuration per data type
export const CACHE_CONFIG = {
    challenges: { ttl: 5 * 60 * 1000, maxItems: 50 },           // 5 min
    userChallenges: { ttl: 5 * 60 * 1000, maxItems: 50 },       // 5 min
    userProfile: { ttl: 15 * 60 * 1000, maxItems: 1 },          // 15 min
    challengeDetail: { ttl: 10 * 60 * 1000, maxItems: 20 },     // 10 min
    challengeCalendar: { ttl: 5 * 60 * 1000, maxItems: 20 },    // 5 min
    leaderboard: { ttl: 2 * 60 * 1000, maxItems: 3 },           // 2 min
    transactions: { ttl: 5 * 60 * 1000, maxItems: 1 },          // 5 min
    // Tapestry social graph
    tapestryProfile: { ttl: 30 * 60 * 1000, maxItems: 1 },      // 30 min
    following: { ttl: 5 * 60 * 1000, maxItems: 1 },             // 5 min
    tapestryFeed: { ttl: 2 * 60 * 1000, maxItems: 1 },          // 2 min (Phase 2)
} as const;

export type CacheKey = keyof typeof CACHE_CONFIG;

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
}

interface CacheMetadata {
    entries: Record<string, { timestamp: number; size: number }>;
    totalSize: number;
}

// Maximum cache size in bytes (approximate)
const MAX_CACHE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Generate a full cache key
 */
function getCacheKey(type: CacheKey, id?: string): string {
    return `${CACHE_PREFIX}${type}${id ? `:${id}` : ''}`;
}

/**
 * Get metadata about all cached items
 */
async function getCacheMetadata(): Promise<CacheMetadata> {
    try {
        const raw = await AsyncStorage.getItem(CACHE_METADATA_KEY);
        if (raw) {
            return JSON.parse(raw);
        }
    } catch (error) {
        console.warn('Error reading cache metadata:', error);
    }
    return { entries: {}, totalSize: 0 };
}

/**
 * Save cache metadata
 */
async function saveCacheMetadata(metadata: CacheMetadata): Promise<void> {
    try {
        await AsyncStorage.setItem(CACHE_METADATA_KEY, JSON.stringify(metadata));
    } catch (error) {
        console.warn('Error saving cache metadata:', error);
    }
}

/**
 * Update metadata for a cache entry
 */
async function updateMetadata(key: string, size: number): Promise<void> {
    const metadata = await getCacheMetadata();

    // Remove old entry size if exists
    if (metadata.entries[key]) {
        metadata.totalSize -= metadata.entries[key].size;
    }

    // Add new entry
    metadata.entries[key] = { timestamp: Date.now(), size };
    metadata.totalSize += size;

    // LRU eviction if over size limit
    if (metadata.totalSize > MAX_CACHE_SIZE) {
        await performLRUEviction(metadata);
    }

    await saveCacheMetadata(metadata);
}

/**
 * Perform LRU eviction to free up space
 */
async function performLRUEviction(metadata: CacheMetadata): Promise<void> {
    // Sort entries by timestamp (oldest first)
    const entries = Object.entries(metadata.entries)
        .sort(([, a], [, b]) => a.timestamp - b.timestamp);

    const keysToRemove: string[] = [];
    let freedSize = 0;
    const targetSize = MAX_CACHE_SIZE * 0.7; // Free up to 70% of max

    for (const [key, entry] of entries) {
        if (metadata.totalSize - freedSize <= targetSize) break;
        keysToRemove.push(key);
        freedSize += entry.size;
        delete metadata.entries[key];
    }

    metadata.totalSize -= freedSize;

    // Remove from AsyncStorage
    if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
        console.log(`LRU eviction: removed ${keysToRemove.length} entries, freed ~${Math.round(freedSize / 1024)}KB`);
    }
}

/**
 * Save data to cache
 */
export async function saveToCache<T>(
    type: CacheKey,
    data: T,
    id?: string
): Promise<void> {
    const key = getCacheKey(type, id);
    const config = CACHE_CONFIG[type];

    const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + config.ttl,
    };

    try {
        const serialized = JSON.stringify(entry);
        await AsyncStorage.setItem(key, serialized);
        await updateMetadata(key, serialized.length);
    } catch (error) {
        console.warn(`Error saving to cache (${type}):`, error);
    }
}

/**
 * Get data from cache
 * Returns null if not found or expired
 */
export async function getFromCache<T>(
    type: CacheKey,
    id?: string
): Promise<T | null> {
    const key = getCacheKey(type, id);

    try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return null;

        const entry: CacheEntry<T> = JSON.parse(raw);

        // Check if expired
        if (Date.now() > entry.expiresAt) {
            // Don't delete yet - might be useful as stale data
            return null;
        }

        return entry.data;
    } catch (error) {
        console.warn(`Error reading from cache (${type}):`, error);
        return null;
    }
}

/**
 * Get stale data from cache (ignoring TTL)
 * Useful when offline and fresh data is unavailable
 */
export async function getStaleFromCache<T>(
    type: CacheKey,
    id?: string
): Promise<{ data: T; isStale: boolean; cachedAt: Date } | null> {
    const key = getCacheKey(type, id);

    try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return null;

        const entry: CacheEntry<T> = JSON.parse(raw);
        const isStale = Date.now() > entry.expiresAt;

        return {
            data: entry.data,
            isStale,
            cachedAt: new Date(entry.timestamp),
        };
    } catch (error) {
        console.warn(`Error reading stale from cache (${type}):`, error);
        return null;
    }
}

/**
 * Invalidate a specific cache entry
 */
export async function invalidateCache(type: CacheKey, id?: string): Promise<void> {
    const key = getCacheKey(type, id);

    try {
        await AsyncStorage.removeItem(key);

        const metadata = await getCacheMetadata();
        if (metadata.entries[key]) {
            metadata.totalSize -= metadata.entries[key].size;
            delete metadata.entries[key];
            await saveCacheMetadata(metadata);
        }
    } catch (error) {
        console.warn(`Error invalidating cache (${type}):`, error);
    }
}

/**
 * Clear all cached data (call on logout)
 */
export async function clearAllCache(): Promise<void> {
    try {
        const allKeys = await AsyncStorage.getAllKeys();
        const cacheKeys = allKeys.filter(k => k.startsWith(CACHE_PREFIX));

        if (cacheKeys.length > 0) {
            await AsyncStorage.multiRemove(cacheKeys);
            console.log(`Cleared ${cacheKeys.length} cache entries`);
        }
    } catch (error) {
        console.warn('Error clearing cache:', error);
    }
}
