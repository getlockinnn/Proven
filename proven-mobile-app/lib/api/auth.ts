/**
 * Authentication utilities for Proven Mobile App
 * Uses expo-secure-store for persistent, secure token storage
 */

import * as SecureStore from 'expo-secure-store';

const AUTH_TOKEN_KEY = 'proven_auth_token';
const OAUTH_STATE_KEY = 'proven_oauth_state';

// Fast path for requests within the same JS runtime session.
// This avoids a SecureStore read on every request, and also prevents a bad state
// where React state has a token but SecureStore write/read fails transiently.
let inMemoryAuthToken: string | null = null;
let inMemoryOAuthState: string | null = null;

/**
 * Get the stored authentication token
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    if (inMemoryAuthToken) return inMemoryAuthToken;
    const stored = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
    inMemoryAuthToken = stored;
    return stored;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

/**
 * Save authentication token
 */
export async function saveAuthToken(token: string): Promise<void> {
  try {
    inMemoryAuthToken = token;
    await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
  } catch (error) {
    console.error('Error saving auth token:', error);
  }
}

/**
 * Clear authentication token (logout)
 */
export async function clearAuthToken(): Promise<void> {
  try {
    inMemoryAuthToken = null;
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  } catch (error) {
    console.error('Error clearing auth token:', error);
  }
}

/**
 * Save a pending OAuth state value for CSRF protection across app restarts.
 */
export async function saveOAuthState(state: string): Promise<void> {
  try {
    inMemoryOAuthState = state;
    await SecureStore.setItemAsync(OAUTH_STATE_KEY, state);
  } catch (error) {
    console.error('Error saving oauth state:', error);
  }
}

/**
 * Get the pending OAuth state value (if any).
 */
export async function getOAuthState(): Promise<string | null> {
  try {
    if (inMemoryOAuthState) return inMemoryOAuthState;
    const stored = await SecureStore.getItemAsync(OAUTH_STATE_KEY);
    inMemoryOAuthState = stored;
    return stored;
  } catch (error) {
    console.error('Error getting oauth state:', error);
    return null;
  }
}

/**
 * Clear pending OAuth state value.
 */
export async function clearOAuthState(): Promise<void> {
  try {
    inMemoryOAuthState = null;
    await SecureStore.deleteItemAsync(OAUTH_STATE_KEY);
  } catch (error) {
    console.error('Error clearing oauth state:', error);
  }
}
