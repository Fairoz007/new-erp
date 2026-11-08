import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {} as Record<string, string | undefined>;
const procEnv = (typeof globalThis !== 'undefined' && (globalThis as any).process?.env) || {};

const supabaseUrl = (
  env.VITE_SUPABASE_URL ||
  env.NEXT_PUBLIC_SUPABASE_URL ||
  procEnv.SUPABASE_URL ||
  procEnv.NEXT_PUBLIC_SUPABASE_URL ||
  procEnv.VITE_SUPABASE_URL
) as string | undefined;

const supabaseKey = (
  env.VITE_SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  procEnv.SUPABASE_ANON_KEY ||
  procEnv.SUPABASE_PUBLISHABLE_KEY ||
  procEnv.VITE_SUPABASE_ANON_KEY ||
  procEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
) as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured) {
  console.warn('Supabase env vars missing: set VITE_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL and VITE_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env');
}

// Browser client (Vite SPA): sessions persist in localStorage and auto-refresh
export const supabase = createClient<Database>(supabaseUrl ?? '', supabaseKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'fleetx-auth-token',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Health check helper: returns connection status with Supabase backend
 */
export async function checkSupabaseConnection(): Promise<{ ok: boolean; message?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Supabase credentials not configured in environment variables' };
  }
  try {
    const { error } = await supabase.auth.getSession();
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true, message: 'Connected to Supabase' };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
