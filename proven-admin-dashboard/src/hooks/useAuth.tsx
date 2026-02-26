import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as authApi from '@/lib/api/auth';
import {
  clearAuthToken,
  clearOAuthState,
  getApiBaseUrl,
  getAuthToken,
  getOAuthState,
  saveAuthToken,
  saveOAuthState,
} from '@/lib/auth/token';

interface AdminStatus {
  isAdmin: boolean;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | null;
  twoFactorEnabled: boolean;
  twoFactorRequired: boolean;
}

type AuthUser = authApi.AuthUser;

interface OAuthCallbackResult {
  success: boolean;
  error?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAdmin: boolean;
  adminStatus: AdminStatus | null;
  twoFactorVerified: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshAdminStatus: () => Promise<AdminStatus | null>;
  refreshUser: () => Promise<AuthUser | null>;
  completeOAuthCallback: (searchParams: URLSearchParams) => Promise<OAuthCallbackResult>;
  setTwoFactorVerified: (verified: boolean) => void;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TWO_FACTOR_VERIFIED_KEY = 'proven_2fa_verified';
const NON_ADMIN_MESSAGE =
  'Access restricted to authorized administrators only. Your account does not have admin privileges.';

function normalizeAuthUser(user?: AuthUser | null): AuthUser | null {
  if (!user?.id || !user?.email) return null;

  return {
    ...user,
    user_metadata: {
      full_name: user.user_metadata?.full_name || user.name || '',
      avatar_url: user.user_metadata?.avatar_url || user.image || '',
    },
  };
}

function generateStateToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function pickAccessToken(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, any>;

  return (
    value.accessToken ||
    value.access_token ||
    value.token ||
    value?.data?.accessToken ||
    value?.data?.access_token ||
    null
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null);
  const [twoFactorVerified, setTwoFactorVerifiedState] = useState<boolean>(() => {
    return sessionStorage.getItem(TWO_FACTOR_VERIFIED_KEY) === 'true';
  });
  const [authError, setAuthError] = useState<string | null>(null);

  const isAdmin = adminStatus?.isAdmin ?? false;

  const setTwoFactorVerified = useCallback((verified: boolean) => {
    setTwoFactorVerifiedState(verified);
    if (verified) {
      sessionStorage.setItem(TWO_FACTOR_VERIFIED_KEY, 'true');
    } else {
      sessionStorage.removeItem(TWO_FACTOR_VERIFIED_KEY);
    }
  }, []);

  const clearSession = useCallback(() => {
    clearAuthToken();
    clearOAuthState();
    setUser(null);
    setAdminStatus(null);
    setTwoFactorVerified(false);
  }, [setTwoFactorVerified]);

  const refreshUser = useCallback(async () => {
    try {
      const response = await authApi.getCurrentUser();
      if (!response.success) return null;
      const nextUser = normalizeAuthUser(response.user);
      setUser(nextUser);
      return nextUser;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const refreshAdminStatus = useCallback(async () => {
    try {
      const response = await authApi.getAdminStatus();
      if (response.success && response.data) {
        setAdminStatus(response.data);
        return response.data;
      }
      setAdminStatus(null);
      return null;
    } catch {
      setAdminStatus(null);
      return null;
    }
  }, []);

  const enforceAdmin = useCallback(async () => {
    const status = await refreshAdminStatus();
    if (status && !status.isAdmin) {
      clearSession();
      setAuthError(NON_ADMIN_MESSAGE);
      return false;
    }
    return true;
  }, [clearSession, refreshAdminStatus]);

  useEffect(() => {
    const init = async () => {
      try {
        const token = getAuthToken();
        if (!token) {
          setIsLoading(false);
          return;
        }

        const currentUser = await refreshUser();
        if (!currentUser) {
          clearSession();
          setIsLoading(false);
          return;
        }

        await enforceAdmin();
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [clearSession, enforceAdmin, refreshUser]);

  const completeOAuthCallback = useCallback(
    async (searchParams: URLSearchParams): Promise<OAuthCallbackResult> => {
      const oauthError = searchParams.get('error');
      const oauthErrorDescription = searchParams.get('error_description');
      if (oauthError) {
        const message = oauthErrorDescription || oauthError;
        setAuthError(message);
        return { success: false, error: message };
      }

      const code = searchParams.get('code');
      const state = searchParams.get('state');
      if (!code) {
        return { success: false, error: 'Missing authorization code.' };
      }

      const expectedState = getOAuthState();
      if (!state || !expectedState || state !== expectedState) {
        clearOAuthState();
        return { success: false, error: 'Invalid auth state. Please try again.' };
      }

      try {
        setIsLoading(true);
        const response = await fetch(`${getApiBaseUrl()}/auth/google`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Type': 'proven-guardian',
          },
          body: JSON.stringify({ code }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            payload?.message || payload?.error_description || 'Could not complete sign in.';
          return { success: false, error: message };
        }

        const accessToken = pickAccessToken(payload);
        if (!accessToken) {
          return { success: false, error: 'No access token returned from backend.' };
        }

        saveAuthToken(accessToken);
        clearOAuthState();

        const currentUser = await refreshUser();
        if (!currentUser) {
          clearSession();
          return { success: false, error: 'Could not load user after sign in.' };
        }

        const allowed = await enforceAdmin();
        if (!allowed) {
          return { success: false, error: NON_ADMIN_MESSAGE };
        }

        setAuthError(null);
        return { success: true };
      } finally {
        setIsLoading(false);
      }
    },
    [clearSession, enforceAdmin, refreshUser]
  );

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    const state = generateStateToken();
    saveOAuthState(state);

    const configuredRedirectUri = (import.meta.env.VITE_AUTH_REDIRECT_URI as string | undefined)?.trim();
    const redirectUri = configuredRedirectUri || `${window.location.origin}/auth/callback`;
    const url = `${getApiBaseUrl()}/auth/google?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
    window.location.assign(url);
  }, []);

  const signInWithEmail = useCallback(async () => {
    return {
      error: new Error('Email/password sign-in is not supported. Use Google sign-in.'),
    };
  }, []);

  const signOut = useCallback(async () => {
    clearSession();
  }, [clearSession]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAdmin,
        adminStatus,
        twoFactorVerified,
        authError,
        signInWithGoogle,
        signInWithEmail,
        signOut,
        refreshAdminStatus,
        refreshUser,
        completeOAuthCallback,
        setTwoFactorVerified,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
