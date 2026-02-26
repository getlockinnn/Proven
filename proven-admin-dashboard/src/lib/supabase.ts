import { createClient } from '@supabase/supabase-js';

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const rawSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

const PLACEHOLDER_URL = 'your-supabase-url';
const PLACEHOLDER_KEY = 'your-supabase-anon-key';

const isValidHttpUrl = (value?: string): value is string => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const supabaseUrl = isValidHttpUrl(rawSupabaseUrl) && rawSupabaseUrl !== PLACEHOLDER_URL
  ? rawSupabaseUrl
  : 'https://placeholder.supabase.co';

const supabaseAnonKey = rawSupabaseAnonKey && rawSupabaseAnonKey !== PLACEHOLDER_KEY
  ? rawSupabaseAnonKey
  : 'placeholder-key';

if (supabaseUrl === 'https://placeholder.supabase.co' || supabaseAnonKey === 'placeholder-key') {
  console.warn('Supabase credentials are missing/invalid. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable authentication.');
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      storageKey: 'proven-guardian-auth',
      storage: localStorage,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  image?: string;
};
