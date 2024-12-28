import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { env } from '../config/env';

// Validate Supabase credentials
if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
  console.error('Missing Supabase credentials. Please check your environment variables.');
}

export const supabase = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
    },
    global: {
      headers: {
        'x-application-name': 'roarbliss',
      },
    },
  }
);