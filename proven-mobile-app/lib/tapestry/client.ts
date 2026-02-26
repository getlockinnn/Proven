/**
 * Tapestry Social Graph Client
 *
 * Uses the official `socialfi` SDK. The default base URL is aligned with
 * socialfi v0.1.x generated routes (`/api/v1`).
 */

import { SocialFi } from 'socialfi';

const TAPESTRY_BASE_URL =
  process.env.EXPO_PUBLIC_TAPESTRY_BASE_URL || 'https://api.usetapestry.dev/api/v1';

export const tapestry = new SocialFi({
  baseURL: TAPESTRY_BASE_URL,
});

export const TAPESTRY_API_KEY = process.env.EXPO_PUBLIC_TAPESTRY_API_KEY || '';
export const TAPESTRY_NAMESPACE = process.env.EXPO_PUBLIC_TAPESTRY_NAMESPACE || 'proven';
export const TAPESTRY_BLOCKCHAIN = 'SOLANA' as const;
export const TAPESTRY_EXECUTION = 'FAST_UNCONFIRMED' as const;

