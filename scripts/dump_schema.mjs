// Dev helper: apply all migrations to an in-memory PGlite and print a compact schema summary.
// Usage: node scripts/dump_schema.mjs [supabase/migrations]
import { setup } from '../supabase/tests/harness.mjs';
const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const cols = await t.db.query(`select table_name, string_agg(column_name || ':' || data_type, ', ' order by ordinal_position) c
  from information_schema.columns where table_schema='public' group by table_name order by table_name`);
for (const r of cols.rows) console.log('T', r.table_name, '(', r.c.replace(/character varying|text/g,'t').replace(/timestamp with time zone/g,'ts').replace(/numeric/g,'num').replace(/boolean/g,'bool'), ')');
const fns = await t.db.query(`select p.proname, pg_get_function_identity_arguments(p.oid) a, p.prosecdef sd from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prorettype <> 'trigger'::regtype order by 1`);
for (const r of fns.rows) console.log('F', r.proname + '(' + r.a + ')');
process.exit(0);
