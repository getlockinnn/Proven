import { createClient } from '@supabase/supabase-js';

// Prefer service role key for generating signed URLs on the server.
// We intentionally avoid throwing at import time if the key is missing.
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

export type SupabaseClient = ReturnType<typeof createClient> | null;

let client: SupabaseClient = null;
if (SUPABASE_SERVICE_ROLE_KEY) {
  client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
} else {
  // eslint-disable-next-line no-console
}

export const supabase: SupabaseClient = client;

// Export URL for fallback public URL construction
export const SUPABASE_URL_VALUE = SUPABASE_URL;


