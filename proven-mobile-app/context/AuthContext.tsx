/**
 * Auth Context (first-party auth; no Supabase)
 *
 * Production-ready pattern:
 * - App opens backend OAuth start URL in a system auth session (ASWebAuthenticationSession / Custom Tabs)
 * - Backend completes Google OAuth and redirects back to the app deep link
 * - App exchanges one-time `code` (or consumes returned `access_token`) and stores an API Bearer token
 */

import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { useRouter, useSegments } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import {
  clearAuthToken,
  clearOAuthState,
  getAuthToken,
  getOAuthState,
  saveAuthToken,
  saveOAuthState,
} from '../lib/api/auth';
import { post } from '../lib/api/client';
import { API_ENDPOINTS, getApiUrl } from '../lib/api/config';
import { clearAllCache, clearQueue } from '../lib/offline';
import { getCurrentUser, type User } from '../services/userService';

WebBrowser.maybeCompleteAuthSession();

type AuthContextType = {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getEnv(name: string): string | undefined {
  const v = (process.env as any)?.[name];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function pickAccessToken(payload: any): string | null {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  return (
    payload.accessToken ||
    payload.access_token ||
    payload.token ||
    payload.jwt ||
    payload?.session?.accessToken ||
    payload?.session?.access_token ||
    null
  );
}

function decodeFormValue(value: string): string {
  // OAuth servers commonly encode spaces as "+"
  return decodeURIComponent(value.replace(/\+/g, ' '));
}

function parseParamString(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input) return out;

  for (const part of input.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    const rawVal = eq === -1 ? '' : part.slice(eq + 1);
    const key = decodeFormValue(rawKey);
    if (!key) continue;
    out[key] = decodeFormValue(rawVal);
  }

  return out;
}

function parseCallbackParams(url: string): {
  code?: string;
  accessToken?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
} {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');

  const query = queryIndex !== -1 ? url.substring(queryIndex + 1, hashIndex !== -1 ? hashIndex : undefined) : '';
  const hash = hashIndex !== -1 ? url.substring(hashIndex + 1) : '';

  const qp = parseParamString(query);
  const hp = parseParamString(hash);
  const get = (key: string) => qp[key] ?? hp[key];

  return {
    code: get('code'),
    accessToken: get('access_token') || get('accessToken') || get('token') || get('jwt'),
    state: get('state'),
    error: get('error'),
    errorDescription: get('error_description'),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Guard to avoid multiple redirects during bootstrap.
  const bootstrapped = useRef(false);

  // Pending OAuth state for CSRF protection.
  const pendingStateRef = useRef<string | null>(null);
  const completingRef = useRef(false);

  const isAuthenticated = !!accessToken;

  const authEndpoints = useMemo(() => {
    // Defaults assume backend implements:
    // GET  /auth/google?redirect_uri=...&state=...
    // POST /auth/google/exchange { code } -> { accessToken }
    //
    // Both may be the same endpoint, depending on your backend.
    const googleStartEndpoint =
      getEnv('EXPO_PUBLIC_AUTH_GOOGLE_START_ENDPOINT') ||
      getEnv('EXPO_PUBLIC_AUTH_GOOGLE_ENDPOINT') ||
      '/auth/google';

    const googleExchangeEndpoint =
      getEnv('EXPO_PUBLIC_AUTH_GOOGLE_EXCHANGE_ENDPOINT') ||
      getEnv('EXPO_PUBLIC_AUTH_GOOGLE_ENDPOINT') ||
      googleStartEndpoint;

    return { googleStartEndpoint, googleExchangeEndpoint };
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await getCurrentUser();
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  const finalizeSession = useCallback(
    async (token: string) => {
      await saveAuthToken(token);
      setAccessToken(token);
      await refreshUser();
    },
    [refreshUser]
  );

  const completeFromCallbackUrl = useCallback(
    async (url: string) => {
      if (completingRef.current) return;
      completingRef.current = true;

      try {
        const { code, accessToken: tokenFromUrl, state, error, errorDescription } = parseCallbackParams(url);

        if (error) {
          throw new Error(errorDescription ? `${error}: ${errorDescription}` : error);
        }

        // Enforce CSRF protection state match. We persist it so cold-start callbacks can still complete.
        const expectedState = pendingStateRef.current || (await getOAuthState());
        // Ignore unexpected callbacks (prevents deep-link injection).
        // Cold-start callbacks are still supported because state is persisted.
        if (!expectedState) return;
        if (!state || state !== expectedState) {
          throw new Error('Auth failed: state mismatch.');
        }

        // Prefer token directly returned in the callback, otherwise exchange the one-time code.
        if (tokenFromUrl) {
          await finalizeSession(tokenFromUrl);
          return;
        }

        if (!code) {
          throw new Error('Auth failed: missing code or access token in callback.');
        }

        const res = await post<any>(authEndpoints.googleExchangeEndpoint, { code }, false);

        const accessToken = pickAccessToken(res);
        if (!accessToken) {
          throw new Error('Auth exchange failed: backend did not return an access token.');
        }

        await finalizeSession(accessToken);
      } finally {
        pendingStateRef.current = null;
        await clearOAuthState();
        completingRef.current = false;
      }
    },
    [authEndpoints.googleExchangeEndpoint, finalizeSession]
  );

  // Bootstrap stored session.
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        setLoading(true);
        const stored = await getAuthToken();
        if (cancelled) return;

        if (stored) {
          setAccessToken(stored);
          await refreshUser();
        }
      } finally {
        if (!cancelled) {
          bootstrapped.current = true;
          setLoading(false);
        }
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  // Deep link handler (covers cases where redirect opens the app directly).
  useEffect(() => {
    const sub = Linking.addEventListener('url', (event) => {
      if (!event?.url) return;
      if (!event.url.includes('auth/callback')) return;
      completeFromCallbackUrl(event.url).catch((e) => {
        console.error('[Auth] callback error:', e);
        router.replace('/(auth)/signin');
        Alert.alert('Sign In Issue', e?.message || 'We could not complete your sign in. Please try again.');
      });
    });

    Linking.getInitialURL().then((url) => {
      if (!url) return;
      if (!url.includes('auth/callback')) return;
      completeFromCallbackUrl(url).catch((e) => {
        console.error('[Auth] initial callback error:', e);
        router.replace('/(auth)/signin');
        Alert.alert('Sign In Issue', e?.message || 'We could not complete your sign in. Please try again.');
      });
    });

    return () => {
      sub.remove();
    };
  }, [completeFromCallbackUrl, router]);

  // Route protection
  useEffect(() => {
    if (loading) return;
    if (!bootstrapped.current) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inMainGroup = segments[0] === '(main)';
    const inOnboarding = segments[0] === '(onboarding)';
    const inAuthCallback = segments[0] === 'auth' && segments[1] === 'callback';

    if (!isAuthenticated && (inMainGroup || inOnboarding)) {
      router.replace('/(auth)/signin');
      return;
    }

    if (isAuthenticated && (inAuthGroup || inAuthCallback)) {
      router.replace('/(main)');
      return;
    }
  }, [segments, isAuthenticated, loading, router]);

  const signInWithGoogle = useCallback(async () => {
    // Deep link the backend should redirect back to after Google OAuth.
    // IMPORTANT: Expo Go (physical device via QR) cannot handle custom schemes like `provenapp://`.
    // It must use the `exp://` redirect that `Linking.createURL()` generates in the store client.
    const executionEnvironment = (Constants as any)?.executionEnvironment as string | undefined;
    const isExpoGo =
      executionEnvironment === 'storeClient' ||
      (!executionEnvironment && Constants.appOwnership === 'expo');

    const redirectUri = Platform.OS === 'web'
      ? Linking.createURL('auth/callback')
      : isExpoGo
        ? Linking.createURL('auth/callback')
        : Linking.createURL('auth/callback', { scheme: 'provenapp' });

    // CSRF protection: backend must echo this back in the redirect.
    const state = Crypto.randomUUID();
    pendingStateRef.current = state;
    await saveOAuthState(state);

    const startUrl =
      `${getApiUrl(authEndpoints.googleStartEndpoint)}` +
      `?redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUri);

    if (result.type !== 'success' || !result.url) {
      pendingStateRef.current = null;
      await clearOAuthState();
      throw new Error('Google sign-in cancelled');
    }

    await completeFromCallbackUrl(result.url);
  }, [authEndpoints.googleStartEndpoint, completeFromCallbackUrl]);

  const signOut = useCallback(async () => {
    try {
      // Best-effort server sign-out (ignore failures).
      await post(API_ENDPOINTS.USER_SIGNOUT, undefined, true).catch(() => {});
      await clearAuthToken();
      await Promise.all([clearAllCache(), clearQueue()]);
    } finally {
      setAccessToken(null);
      setUser(null);
      router.replace('/(auth)/signin');
    }
  }, [router]);

  const value: AuthContextType = {
    user,
    accessToken,
    loading,
    isAuthenticated,
    signInWithGoogle,
    signOut,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
