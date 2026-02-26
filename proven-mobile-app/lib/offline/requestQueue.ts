/**
 * Request Queue - Persistent queue for offline mutations
 * 
 * Queues POST/PUT/DELETE requests when offline and processes them
 * when connectivity is restored.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@proven_request_queue';
const MAX_QUEUE_SIZE = 50;
const MAX_RETRY_COUNT = 3;

export interface QueuedRequest {
    id: string;
    endpoint: string;
    method: 'POST' | 'PUT' | 'DELETE';
    body?: Record<string, unknown>;
    timestamp: number;
    retryCount: number;
    type: 'proofSubmission' | 'profileUpdate' | 'generic';
    metadata?: Record<string, unknown>; // For storing local file references, etc.
}

export interface QueueStatus {
    pendingCount: number;
    failedCount: number;
    processing: boolean;
    lastProcessedAt: Date | null;
}

let isProcessing = false;
let lastProcessedAt: Date | null = null;

/**
 * Generate unique ID for queued request
 */
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get all queued requests
 */
export async function getQueuedRequests(): Promise<QueuedRequest[]> {
    try {
        const raw = await AsyncStorage.getItem(QUEUE_KEY);
        if (raw) {
            return JSON.parse(raw);
        }
    } catch (error) {
        console.warn('Error reading request queue:', error);
    }
    return [];
}

/**
 * Save queue to storage
 */
async function saveQueue(queue: QueuedRequest[]): Promise<void> {
    try {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
        console.warn('Error saving request queue:', error);
    }
}

/**
 * Add a request to the queue
 */
export async function queueRequest(
    request: Omit<QueuedRequest, 'id' | 'retryCount'>
): Promise<string> {
    const queue = await getQueuedRequests();

    // Check queue size limit
    if (queue.length >= MAX_QUEUE_SIZE) {
        throw new Error('Request queue is full. Please try again when online.');
    }

    const queuedRequest: QueuedRequest = {
        ...request,
        id: generateId(),
        retryCount: 0,
    };

    queue.push(queuedRequest);
    await saveQueue(queue);

    console.log(`Queued request: ${request.method} ${request.endpoint}`);
    return queuedRequest.id;
}

/**
 * Remove a request from the queue
 */
export async function removeFromQueue(id: string): Promise<void> {
    const queue = await getQueuedRequests();
    const filtered = queue.filter(r => r.id !== id);
    await saveQueue(filtered);
}

/**
 * Update a request in the queue (for retry count, etc.)
 */
export async function updateQueuedRequest(
    id: string,
    updates: Partial<QueuedRequest>
): Promise<void> {
    const queue = await getQueuedRequests();
    const index = queue.findIndex(r => r.id === id);

    if (index !== -1) {
        queue[index] = { ...queue[index], ...updates };
        await saveQueue(queue);
    }
}

/**
 * Clear all queued requests (call on logout)
 */
export async function clearQueue(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
    console.log('Request queue cleared');
}

/**
 * Get queue status
 */
export async function getQueueStatus(): Promise<QueueStatus> {
    const queue = await getQueuedRequests();

    return {
        pendingCount: queue.filter(r => r.retryCount < MAX_RETRY_COUNT).length,
        failedCount: queue.filter(r => r.retryCount >= MAX_RETRY_COUNT).length,
        processing: isProcessing,
        lastProcessedAt,
    };
}

/**
 * Process a single queued request
 * Returns true if successful, false if failed
 */
async function processRequest(
    request: QueuedRequest,
    fetchFn: (endpoint: string, options: RequestInit) => Promise<Response>
): Promise<boolean> {
    try {
        const response = await fetchFn(request.endpoint, {
            method: request.method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: request.body ? JSON.stringify(request.body) : undefined,
        });

        if (response.ok) {
            await removeFromQueue(request.id);
            console.log(`Successfully processed queued request: ${request.id}`);
            return true;
        }

        // Non-retryable errors (4xx except 408, 429)
        if (response.status >= 400 && response.status < 500 &&
            response.status !== 408 && response.status !== 429) {
            console.warn(`Queued request failed permanently: ${response.status}`);
            await removeFromQueue(request.id);
            return false;
        }

        // Retryable error
        throw new Error(`Request failed with status ${response.status}`);
    } catch (error) {
        // Increment retry count
        await updateQueuedRequest(request.id, { retryCount: request.retryCount + 1 });

        if (request.retryCount + 1 >= MAX_RETRY_COUNT) {
            console.warn(`Queued request exceeded max retries: ${request.id}`);
        }

        return false;
    }
}

/**
 * Process all queued requests
 * Call this when connectivity is restored
 */
export async function processQueue(
    fetchFn: (endpoint: string, options: RequestInit) => Promise<Response>,
    onProgress?: (processed: number, total: number) => void
): Promise<{ success: number; failed: number }> {
    if (isProcessing) {
        console.log('Queue is already being processed');
        return { success: 0, failed: 0 };
    }

    isProcessing = true;
    const queue = await getQueuedRequests();
    const pending = queue.filter(r => r.retryCount < MAX_RETRY_COUNT);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < pending.length; i++) {
        const request = pending[i];
        const result = await processRequest(request, fetchFn);

        if (result) {
            success++;
        } else {
            failed++;
        }

        onProgress?.(i + 1, pending.length);
    }

    lastProcessedAt = new Date();
    isProcessing = false;

    console.log(`Queue processing complete: ${success} success, ${failed} failed`);
    return { success, failed };
}

