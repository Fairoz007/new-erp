// Dev helper: print the final definition of functions after all migrations. Usage: node scripts/show_fn.mjs name1 name2
import { setup } from '../supabase/tests/harness.mjs';
const t = await setup('supabase/migrations', { quiet: true });
for (const n of process.argv.slice(2)) {
  const r = await t.db.query(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname=$1`, [n]);
  for (const x of r.rows) console.log(x.d);
  if (n.startsWith('v_')) { const v = await t.db.query(`select pg_get_viewdef('public.${n}'::regclass, true) d`); console.log('VIEW', n, v.rows[0].d); }
}
process.exit(0);
