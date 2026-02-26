/**
 * Network Context - Global network state and sync management
 * 
 * Provides:
 * - Global network online/offline status
 * - Pending sync count from request queue
 * - Manual sync trigger
 * - Queue processing on connectivity restore
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';
import { getApiUrl } from '../lib/api/config';
import { getAuthToken } from '../lib/api/auth';
import {
    getQueueStatus,
    processQueue,
    QueueStatus,
} from '../lib/offline';
import { useNetworkStatus, NetworkStatus } from '../hooks/useNetworkStatus';
import { retryPendingProofs, getAllPendingProofs } from '../services/proofService';

interface NetworkContextType {
    // Network status
    network: NetworkStatus;
    isOnline: boolean;
    isOffline: boolean;

    // Sync status
    pendingCount: number;
    pendingProofsCount: number;
    isSyncing: boolean;
    lastSyncedAt: Date | null;

    // Actions
    triggerSync: () => Promise<void>;
    refreshStatus: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
    const network = useNetworkStatus();
    const [queueStatus, setQueueStatus] = useState<QueueStatus>({
        pendingCount: 0,
        failedCount: 0,
        processing: false,
        lastProcessedAt: null,
    });
    const [pendingProofsCount, setPendingProofsCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

    // Track previous online state to detect reconnection
    const [wasOffline, setWasOffline] = useState(false);

    const isOnline = !network.isOffline;
    const isOffline = network.isOffline;

    // Refresh queue status (includes pending proofs)
    const refreshStatus = useCallback(async () => {
        const [status, pendingProofs] = await Promise.all([
            getQueueStatus(),
            getAllPendingProofs(),
        ]);
        setQueueStatus(status);
        setPendingProofsCount(pendingProofs.length);
    }, []);

    // Create authenticated fetch function for queue processing
    const createAuthenticatedFetch = useCallback(async () => {
        return async (endpoint: string, options: RequestInit): Promise<Response> => {
            const token = await getAuthToken();
            const url = getApiUrl(endpoint);

            return fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
            });
        };
    }, []);

    // Trigger manual sync - processes both request queue and pending proofs
    const triggerSync = useCallback(async () => {
        if (isSyncing || isOffline) return;

        setIsSyncing(true);
        try {
            // Process generic request queue
            const fetchFn = await createAuthenticatedFetch();
            await processQueue(fetchFn);

            // Process pending proof uploads
            const proofResults = await retryPendingProofs();
            if (proofResults.success > 0 || proofResults.failed > 0) {
                console.log(`[Sync] Proofs: ${proofResults.success} uploaded, ${proofResults.failed} failed`);
            }

            setLastSyncedAt(new Date());
            await refreshStatus();
        } catch (error) {
            console.error('Sync failed:', error);
        } finally {
            setIsSyncing(false);
        }
    }, [isSyncing, isOffline, createAuthenticatedFetch, refreshStatus]);

    // Auto-sync when coming back online
    useEffect(() => {
        if (isOffline) {
            setWasOffline(true);
        } else if (wasOffline && isOnline) {
            // Just came back online
            setWasOffline(false);

            // Wait a moment for connection to stabilize, then sync
            const timer = setTimeout(() => {
                triggerSync();
            }, 2000);

            return () => clearTimeout(timer);
        }
    }, [isOnline, isOffline, wasOffline, triggerSync]);

    // Refresh status periodically and on mount
    useEffect(() => {
        refreshStatus();

        const interval = setInterval(refreshStatus, 30000); // Every 30s
        return () => clearInterval(interval);
    }, [refreshStatus]);

    const contextValue: NetworkContextType = {
        network,
        isOnline,
        isOffline,
        pendingCount: queueStatus.pendingCount + pendingProofsCount,
        pendingProofsCount,
        isSyncing,
        lastSyncedAt,
        triggerSync,
        refreshStatus,
    };

    return (
        <NetworkContext.Provider value={contextValue}>
            {children}
        </NetworkContext.Provider>
    );
}

export function useNetwork(): NetworkContextType {
    const context = useContext(NetworkContext);
    if (context === undefined) {
        throw new Error('useNetwork must be used within a NetworkProvider');
    }
    return context;
}

/**
 * Convenience hook for just checking online status
 */
export function useIsConnected(): boolean {
    const { isOnline } = useNetwork();
    return isOnline;
}
