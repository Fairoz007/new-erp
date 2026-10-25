import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase env vars missing: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local');
}

// Browser client (Vite SPA): sessions persist in localStorage and auto-refresh
export const supabase = createClient<Database>(supabaseUrl ?? '', supabaseKey ?? '', {
  auth: { persistSession: true, autoRefreshToken: true },
});
