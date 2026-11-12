// Caps on expensive RPCs (Phase 6): every callable function that takes a page size refuses more
// than 1000 rows, and the date-series function is bounded. Standalone:
//   node supabase/tests/rpc_caps.test.mjs supabase/migrations
import { setup } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { check, asServer, assert } = t;
const fns = (await asServer(`select p.proname n, p.prosrc s from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and 'p_limit' = any(p.proargnames) and has_function_privilege('authenticated', p.oid, 'execute')`)).rows;
await check('callable functions with a page size found', () => { assert(fns.length >= 6, fns.length); return fns.map(f => f.n).join(', '); });
for (const f of fns) {
  await check(`${f.n}: page size capped at 1000`, () => {
    assert(/p_limit\s*>\s*1000/.test(f.s) || /least\(\s*(coalesce\()?p_limit/.test(f.s), 'no cap on p_limit'); return 'capped';
  });
}
await check('dashboard_series is bounded to 400 days', async () => {
  const s = (await asServer(`select prosrc from pg_proc where proname = 'dashboard_series'`)).rows[0]?.prosrc ?? '';
  assert(/p_from \+ 400/.test(s), 'no bound'); return 'ok';
});
t.report();
