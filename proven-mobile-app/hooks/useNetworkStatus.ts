/**
 * useNetworkStatus - React hook for network connectivity detection
 * 
 * Simplified version that assumes online status.
 * Requests will fail naturally if offline.
 */

export interface NetworkStatus {
    isConnected: boolean;
    isInternetReachable: boolean | null;
    type: string;
    isWifi: boolean;
    isCellular: boolean;
    isOffline: boolean;
    connectionQuality: 'good' | 'poor' | 'offline';
}

const ONLINE_STATUS: NetworkStatus = {
    isConnected: true,
    isInternetReachable: true,
    type: 'unknown',
    isWifi: false,
    isCellular: false,
    isOffline: false,
    connectionQuality: 'good',
};

/**
 * Hook to get current network status
 * Simplified: always returns online status
 */
export function useNetworkStatus(): NetworkStatus {
    return ONLINE_STATUS;
}

/**
 * Imperative function to check if currently online
 * Simplified: always returns true, let requests fail naturally if offline
 */
export async function checkIsOnline(): Promise<boolean> {
    return true;
}
