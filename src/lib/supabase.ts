import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase env vars missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env');
}

// Browser client (Vite SPA): sessions persist in localStorage and auto-refresh
export const supabase = createClient<Database>(supabaseUrl ?? '', supabaseKey ?? '', {
  auth: { persistSession: true, autoRefreshToken: true },
});
