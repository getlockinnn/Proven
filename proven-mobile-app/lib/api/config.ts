/**
 * API Configuration for Proven Mobile App
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Production API URL
// Keep this in sync with the deployed backend (nginx -> node).
const PROD_API_URL = 'https://proven-server.onrender.com/api';

const normalizeApiBaseUrl = (value: string | undefined | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Keep config flexible: if someone passes the domain root, append /api.
  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  return withoutTrailingSlash.endsWith('/api')
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/api`;
};

const getDevServerHost = (): string | null => {
  const hostUri =
    // Prefer modern Expo config (dev)
    Constants.expoConfig?.hostUri ||
    // Expo Go config sometimes exposes developer host
    Constants.expoGoConfig?.developer?.hostUri ||
    // Older manifest (legacy)
    (Constants as any).manifest?.debuggerHost ||
    // Expo Updates manifest2 (dev client / EAS Update)
    (Constants.manifest2 as any)?.extra?.expoClient?.hostUri ||
    (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost;

  if (!hostUri) return null;
  return hostUri.split(':')[0];
};

// Get API URL based on environment
const getApiBaseUrl = (): string => {
  // Allow explicit override via env in all builds.
  const envApiUrl = normalizeApiBaseUrl(
    process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_API_BASE_URL
  );
  if (envApiUrl) return envApiUrl;

  // Check for custom API URL in app config (set in app.json or app.config.js)
  const customApiUrl = normalizeApiBaseUrl(Constants.expoConfig?.extra?.apiUrl);
  if (customApiUrl) return customApiUrl;

  // Default to production URL in production builds.
  if (!__DEV__) return PROD_API_URL;

  // For development, try to use the Expo debugger host
  // This automatically gets the correct IP for the development machine
  const host = getDevServerHost();
  if (host) {
    return `http://${host}:3001/api`;
  }

  // Fallback for different platforms
  if (Platform.OS === 'android') {
    // Android emulator uses 10.0.2.2 to reach host machine
    return 'http://10.0.2.2:3001/api';
  }

  // iOS simulator can use localhost
  return 'http://localhost:3001/api';
};

export const API_BASE_URL = getApiBaseUrl();

// API Endpoints
export const API_ENDPOINTS = {
  // Challenges
  CHALLENGES: '/challenges',
  CHALLENGE_BY_ID: (id: string) => `/challenges/${id}`,
  CHALLENGE_STAKE_QUOTE: (id: string) => `/challenges/${id}/stake-quote`,
  CHALLENGE_JOIN: '/challenges/join',
  CHALLENGE_USER: '/challenges/user',
  CHALLENGE_CHECK: (id: string) => `/challenges/${id}/check`,

  // Solana Pay
  SOLANA_PAY_URL: (id: string) => `/challenges/${id}/solana-pay-url`,
  VERIFY_TRANSFER: (referenceKey: string) => `/challenges/verify-transfer/${referenceKey}`,
  COMPLETE_SOLANA_PAY_JOIN: '/challenges/complete-solana-pay-join',

  // User
  USER_PROFILE: '/users/me',
  USER_SIGNOUT: '/users/signout',

  // Submissions
  SUBMISSION_SUBMIT: '/submissions/submit',
  SUBMISSION_CALENDAR: (challengeId: string) => `/submissions/challenge/${challengeId}/calendar`,

  // Transactions
  TRANSACTIONS: '/transactions/history',

  // Leaderboard
  LEADERBOARD: '/leaderboard',
  LEADERBOARD_ALL: '/leaderboard/all',
  LEADERBOARD_ME: '/leaderboard/me',

  // Storage
  STORAGE_PROOF_SIGNED_UPLOAD: '/storage/proof/signed-upload',
  STORAGE_PROOF_PROXY_UPLOAD: '/storage/proof/upload',
  STORAGE_PROFILE_IMAGE_SIGNED_UPLOAD: '/storage/profile-image/signed-upload',
} as const;

/**
 * Get full API URL for an endpoint
 */
export const getApiUrl = (endpoint: string): string => {
  // Allow passing absolute URLs for endpoints that live outside API_BASE_URL
  // (e.g. auth flows hosted on a different domain/path).
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
};
