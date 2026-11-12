// Lists the public tables that the migrations themselves fill (built-in settings) on an empty
// database, with their row counts. Everything else is business data.
import { setup } from '../../supabase/tests/harness.mjs';
const t = await setup('supabase/migrations', { quiet: true });
const tables = (await t.db.query(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`)).rows.map(r => r.table_name);
const out = {};
for (const n of tables) out[n] = (await t.db.query(`select count(*)::int c from public."${n}"`)).rows[0].c;
console.log(JSON.stringify({ seeded: Object.fromEntries(Object.entries(out).filter(([, c]) => c > 0)), total: tables.length, data: tables.filter(n => !out[n]) }));
process.exit(0);
