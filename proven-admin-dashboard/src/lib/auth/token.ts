const AUTH_TOKEN_KEY = 'proven_guardian_auth_token';
const OAUTH_STATE_KEY = 'proven_guardian_oauth_state';

export const getApiBaseUrl = (): string => {
  const fallback = 'https://proven-server.onrender.com/api';
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  const normalized = (raw || fallback).replace(/\/+$/, '');

  // Temporary safety guard: force admin away from legacy AWS domain
  // while backend is being served from Render.
  if (/^https?:\/\/api\.tryproven\.fun(?:\/|$)/i.test(normalized)) {
    return fallback;
  }

  return normalized;
};

export const getAuthToken = (): string | null => {
  return localStorage.getItem(AUTH_TOKEN_KEY);
};

export const saveAuthToken = (token: string): void => {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
};

export const clearAuthToken = (): void => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
};

export const saveOAuthState = (state: string): void => {
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
};

export const getOAuthState = (): string | null => {
  return sessionStorage.getItem(OAUTH_STATE_KEY);
};

export const clearOAuthState = (): void => {
  sessionStorage.removeItem(OAUTH_STATE_KEY);
};
