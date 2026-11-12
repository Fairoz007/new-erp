// Supabase's pg_safeupdate refuses UPDATE / DELETE without WHERE, also inside functions called
// through the API. PGlite does not enforce it, so this scans every function body instead.
import { setup } from './harness.mjs';
const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { check, assert } = t;

const fns = (await t.db.query(`select p.proname, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang where n.nspname = 'public' and l.lanname in ('plpgsql', 'sql')`)).rows;

/** UPDATE / DELETE statements of a function body that have no WHERE of their own. */
export function unqualifiedWrites(src) {
  let s = src.replace(/--[^\n]*/g, ' ').replace(/'(?:[^']|'')*'/g, "''").replace(/\s+/g, ' ');
  for (let k = 0; k < 20 && /[()]/.test(s); k++) s = s.replace(/\([^()]*\)/g, '~');   // drop subqueries and calls
  const out = [];
  for (const st of s.split(';')) {
    const m = st.match(/\b(update\s+(only\s+)?[\w."]+(\s+\w+)?\s+set\b.*|delete\s+from\s+(only\s+)?[\w."]+.*)$/i);
    if (m && !/\bwhere\b/i.test(m[1])) out.push(m[1].trim().slice(0, 100));
  }
  return out;
}

await check('the scanner finds a write without WHERE and ignores WHERE inside a subquery', async () => {
  assert(unqualifiedWrites(`begin update t set a = (select x from y where z); end`).length === 1, 'subquery WHERE counted');
  assert(unqualifiedWrites(`begin delete from t where true; update t set a = 1 where id = 2; end`).length === 0, 'qualified flagged');
  assert(unqualifiedWrites(`begin update t set a = f(1, g(2)), b = (select x from y where z between 1 and 9); end`).length === 1, 'nested subquery WHERE counted');
  return 'ok';
});
await check('no function in public updates or deletes without a WHERE clause', async () => {
  const bad = fns.flatMap(f => unqualifiedWrites(f.prosrc).map(w => `${f.proname}: ${w}`));
  assert(bad.length === 0, bad.join(' | ')); return `${fns.length} functions scanned`;
});
t.report();
