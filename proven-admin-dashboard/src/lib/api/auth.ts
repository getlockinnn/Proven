import { apiClient } from './client';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
}

interface MeResponse {
  success: boolean;
  message?: string;
  user?: AuthUser;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  image?: string;
  role?: string;
  isAdmin?: boolean;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
}

// Admin status response
export interface AdminStatus {
  isAdmin: boolean;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | null;
  twoFactorEnabled: boolean;
  twoFactorRequired: boolean;
}

// 2FA setup response
export interface TwoFactorSetup {
  qrCodeUrl: string;
  otpauthUrl: string;
  backupCodes: string[];
}

// 2FA verification response
export interface TwoFactorVerifyResult {
  verified: boolean;
  usedBackupCode: boolean;
}

export const getCurrentUser = () =>
  apiClient.get<MeResponse>('/auth/me');

/**
 * Get current user's admin status and 2FA status
 */
export const getAdminStatus = () =>
  apiClient.get<ApiResponse<AdminStatus>>('/auth/admin-status');

/**
 * Setup 2FA - generates QR code and backup codes
 */
export const setup2FA = () =>
  apiClient.post<ApiResponse<TwoFactorSetup>>('/auth/2fa/setup');

/**
 * Verify 2FA setup with a code from authenticator app
 */
export const verifySetup2FA = (token: string) =>
  apiClient.post<ApiResponse<void>>('/auth/2fa/verify-setup', { token });

/**
 * Verify 2FA code during login
 */
export const verify2FA = (token: string) =>
  apiClient.post<ApiResponse<TwoFactorVerifyResult>>('/auth/2fa/verify', { token });

/**
 * Disable 2FA (requires current 2FA code)
 */
export const disable2FA = (token: string) =>
  apiClient.post<ApiResponse<void>>('/auth/2fa/disable', { token });

/**
 * Regenerate backup codes
 */
export const regenerateBackupCodes = (token: string) =>
  apiClient.post<ApiResponse<{ backupCodes: string[] }>>('/auth/2fa/regenerate-backup-codes', { token });
