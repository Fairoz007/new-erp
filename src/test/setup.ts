// Unit tests never talk to a Supabase project: the client module is replaced by an inert stub.
// Database behaviour is tested against PGlite (supabase/tests/harness.mjs) instead.
import { vi } from 'vitest';

vi.mock('../lib/supabase', () => {
  const fail = () => { throw new Error('Unit tests must not call Supabase; use the PGlite harness.'); };
  return { supabase: new Proxy({}, { get: () => fail }), isSupabaseConfigured: false };
});
