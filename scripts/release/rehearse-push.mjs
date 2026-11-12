// Rehearse `supabase db push` on a local copy of a project's data (PGlite, nothing remote).
//   node scripts/release/rehearse-push.mjs <backup dir from export-data.mjs> <latest applied version>
// 1. applies the migrations the project already has, 2. compares that schema with the project's
// (columns and function bodies), 3. loads the exported rows, 4. applies the pending migrations
// one by one and prints row counts before/after, roles, approval limits and each user's access.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'fs';
import { SUPABASE_STUB } from '../../supabase/tests/harness.mjs';
const bk = process.argv[2], applied = process.argv[3];
const db = new PGlite();
await db.exec(SUPABASE_STUB);
const files = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
const done = files.filter(f => f.slice(0, 14) <= applied), todo = files.filter(f => f.slice(0, 14) > applied);
for (const f of done) await db.exec(readFileSync('supabase/migrations/' + f, 'utf8'));
// drift check against the project
const remoteCols = JSON.parse(readFileSync(`${bk}/schema.columns.json`)).map(c => `${c.table_name}.${c.column_name}:${c.data_type}:${c.is_nullable}`);
const localCols = (await db.query(`select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema='public' order by 1,2`)).rows.map(c => `${c.table_name}.${c.column_name}:${c.data_type}:${c.is_nullable}`);
const rf = JSON.parse(readFileSync(`${bk}/schema.functions.json`)).map(f => `${f.f}:${f.h}`);
const lf = (await db.query(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' f, md5(replace(p.prosrc, E'\r', '')) h from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1`)).rows.map(f => `${f.f}:${f.h}`);
const diff = (a, b) => a.filter(x => !b.includes(x));
const name = x => x.split(':')[0];
console.log('drift columns only remote:', diff(remoteCols, localCols), '| only local:', diff(localCols, remoteCols));
const fr = diff(rf, lf), fl = diff(lf, rf);
console.log('drift functions: remote', rf.length, 'local', lf.length, '| differing:', [...new Set([...fr, ...fl].map(name))].join(', ') || 'none');
console.log('  only on remote:', fr.map(name).filter(n => !fl.map(name).includes(n)).join(', ') || 'none', '| only local:', fl.map(name).filter(n => !fr.map(name).includes(n)).join(', ') || 'none');
// load the real rows
const manifest = JSON.parse(readFileSync(`${bk}/manifest.json`));
await db.exec(`set session_replication_role = replica`);
for (const [t, n] of Object.entries(manifest)) if (n && t !== 'auth.users') await db.exec(`truncate public."${t}" cascade`);
const users = JSON.parse(readFileSync(`${bk}/auth.users.json`));
await db.query(`insert into auth.users select * from json_populate_recordset(null::auth.users, $1::json)`, [JSON.stringify(users)]);
for (const [t, n] of Object.entries(manifest)) if (n && t !== 'auth.users') {
  await db.query(`insert into public."${t}" overriding system value select * from json_populate_recordset(null::public."${t}", $1::json)`, [readFileSync(`${bk}/public.${t}.json`, 'utf8')]);
}
await db.exec(`set session_replication_role = origin`);
const count = async t => (await db.query(`select count(*)::int n from public."${t}"`)).rows[0].n;
const before = {}; for (const [t, n] of Object.entries(manifest)) if (n && t !== 'auth.users') before[t] = await count(t);
// apply the pending migrations, one by one, exactly as db push does
for (const f of todo) {
  try { await db.exec(readFileSync('supabase/migrations/' + f, 'utf8')); console.log('OK  ', f); }
  catch (e) { console.log('FAIL', f, '\n    ', e.message); process.exit(1); }
}
const after = {}; for (const t of Object.keys(before)) after[t] = await count(t).catch(e => 'ERR ' + e.message);
console.log('rows before → after:', Object.entries(before).map(([t, n]) => `${t} ${n}→${after[t]}`).join(', '));
const r = async s => (await db.query(s)).rows;
console.log('profiles without role_id:', await r(`select count(*)::int n from public.profiles where role_id is null`));
console.log('role grants per role:', await r(`select r.name, count(g.*)::int grants from public.roles r left join public.role_grants g on g.role_id=r.id group by 1 order by 1`));
console.log('approval limits:', await r(`select r.name, l.module, l.max_amount from public.role_approval_limits l join public.roles r on r.id=l.role_id order by 1,2`));
console.log('users per role:', await r(`select r.name, count(*)::int n from public.profiles p join public.roles r on r.id=p.role_id group by 1 order by 1`));
console.log('members:', await r(`select count(*)::int n, count(role_id)::int with_role from public.company_members`));
console.log('companies:', await r(`select code, organization_id is not null has_org from public.companies order by 1`));
console.log('latest:', todo.at(-1));
console.log('profile status:', await r(`select status, all_offices, count(*)::int n from public.profiles group by 1,2`));
const ids = (await r(`select id from public.profiles`)).map(x => x.id);
const access = [];
for (const id of ids) {
  await db.exec(`set role authenticated; select set_config('request.uid', '${id}', false)`);
  const row = (await db.query(`select (select name from public.roles where id = (select role_id from public.profiles where id = auth.uid())) role, (select count(*)::int from public.companies) offices_visible, (select count(*)::int from public.vehicles) vehicles_visible, public.has_perm('vehicles','view') vehicles_view, public.has_perm('invoices','view') invoices_view`)).rows[0];
  await db.exec(`reset role; select set_config('request.uid', '', false)`);
  access.push(row);
}
console.log('access per user:', JSON.stringify(access));
