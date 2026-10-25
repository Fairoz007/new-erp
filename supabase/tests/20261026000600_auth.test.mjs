// Auth / user-administration security tests (Agent G, migration 20261026000600_auth.sql).
// Standalone: node supabase/tests/20261026000600_auth.test.mjs supabase/migrations
// Applies every migration in the directory to an in-memory PGlite, then checks that
// users cannot escalate their own privileges or reach offices they don't manage.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = process.argv[2] || 'supabase/migrations';
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth to authenticated;
  grant execute on function auth.uid() to authenticated;
`);

for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
  try { await db.exec(readFileSync(join(dir, f), 'utf8')); }
  catch (e) { console.log('FAIL migration', f, '\n  ', e.message); process.exit(1); }
}

const results = [];
const check = async (name, fn, expectError) => {
  try { const r = await fn(); results.push([expectError ? 'FAIL' : 'PASS', name, expectError ? `expected error, got ${JSON.stringify(r ?? 'success')}` : '']); }
  catch (e) { results.push([expectError && (expectError === true || e.message.includes(expectError)) ? 'PASS' : 'FAIL', name, e.message]); }
};
const as = async (uid, sql, params) => {
  await db.exec(`set role authenticated; select set_config('request.uid', '${uid}', false);`);
  try { return await db.query(sql, params); }
  finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); }
};
// RLS-filtered UPDATE/DELETE affect 0 rows silently: turn that into an error so tests can assert it.
const asChanged = async (uid, sql) => {
  const r = await as(uid, sql);
  if (!r.affectedRows) throw new Error('no rows changed (RLS)');
  return r.affectedRows;
};

const SA = '00000000-0000-0000-0000-0000000000a1', CA = '00000000-0000-0000-0000-0000000000a2',
      FLEET = '00000000-0000-0000-0000-0000000000a3', OTHER = '00000000-0000-0000-0000-0000000000a4',
      NEWBIE = '00000000-0000-0000-0000-0000000000a5';
const HO = '11111111-1111-1111-1111-1111111111a1', DQ = '22222222-2222-2222-2222-2222222222a2';

await db.exec(`
  select set_config('request.uid', '', false);
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${SA}','sa@x','{}'), ('${CA}','ca@x','{}'), ('${FLEET}','f@x','{}'), ('${OTHER}','o@x','{}'),
    ('${NEWBIE}','n@x','{"role":"Super Admin"}');
  insert into public.companies (id, name, code) values ('${HO}','Head Office','GHO'), ('${DQ}','Duqm','GDQ')
    on conflict do nothing;
  delete from public.company_members where user_id in ('${SA}','${CA}','${FLEET}','${OTHER}','${NEWBIE}');
  insert into public.company_members (user_id, company_id) values
    ('${CA}','${HO}'), ('${FLEET}','${HO}'), ('${OTHER}','${DQ}');
`);

// Bootstrap path (server-side, auth.uid() null) — how the first Super Admin is created.
await check('server-side bootstrap can promote first Super Admin', () =>
  db.query(`update public.profiles set role = 'Super Admin' where id = '${SA}'`));
await db.exec(`
  update public.profiles set role = 'Company Admin' where id = '${CA}';
  update public.profiles set role = 'Fleet Manager' where id in ('${FLEET}','${OTHER}');
`);

await check('user_metadata role is ignored on signup (new user is Viewer)', async () => {
  const r = await db.query(`select role from public.profiles where id = '${NEWBIE}'`);
  if (r.rows[0].role !== 'Viewer') throw new Error('got ' + r.rows[0].role);
});

// Self-service limits
await check('Fleet Manager cannot promote self', () =>
  as(FLEET, `update public.profiles set role = 'Super Admin' where id = '${FLEET}'`), 'Only administrators');
await check('Fleet Manager cannot reactivate/deactivate self', () =>
  as(FLEET, `update public.profiles set status = 'inactive' where id = '${FLEET}'`), 'Only administrators');
await check('Fleet Manager can edit own name/phone', () =>
  asChanged(FLEET, `update public.profiles set name = 'Fleet M', phone = '123' where id = '${FLEET}'`));
await check('Fleet Manager cannot change own email (identity spoofing)', () =>
  as(FLEET, `update public.profiles set email = 'sa@x' where id = '${FLEET}'`), 'cannot be changed');
await check('Fleet Manager cannot edit another user', () =>
  asChanged(FLEET, `update public.profiles set name = 'x' where id = '${OTHER}'`), 'no rows changed');

// Company Admin limits
await check('Company Admin cannot promote self to Super Admin', () =>
  as(CA, `update public.profiles set role = 'Super Admin' where id = '${CA}'`), 'Permission denied');
await check('Company Admin cannot grant Super Admin to others', () =>
  as(CA, `update public.profiles set role = 'Super Admin' where id = '${FLEET}'`), 'Super Admin');
await check('Company Admin cannot demote a Super Admin', () =>
  as(CA, `update public.profiles set role = 'Viewer' where id = '${SA}'`), 'Permission denied');
await check('Company Admin can change role of a user in own office', () =>
  asChanged(CA, `update public.profiles set role = 'Maintenance Manager' where id = '${FLEET}'`));
await check('Company Admin cannot change role of a user in another office', () =>
  as(CA, `update public.profiles set role = 'Viewer' where id = '${OTHER}'`), 'office you do not manage');
await check('Company Admin cannot rename a user in another office', () =>
  as(CA, `update public.profiles set name = 'x' where id = '${OTHER}'`), 'office you do not manage');
await check('Company Admin can set role of an unassigned invitee', () =>
  asChanged(CA, `update public.profiles set role = 'Accountant' where id = '${NEWBIE}'`));

// Office memberships
await check('Fleet Manager cannot add self to another office', () =>
  as(FLEET, `insert into public.company_members (user_id, company_id) values ('${FLEET}','${DQ}')`), true);
await check('Company Admin cannot add self to another office', () =>
  as(CA, `insert into public.company_members (user_id, company_id) values ('${CA}','${DQ}')`), true);
await check('Company Admin cannot remove a user from another office', () =>
  asChanged(CA, `delete from public.company_members where user_id = '${OTHER}' and company_id = '${DQ}'`), 'no rows changed');
await check('Company Admin can assign invitee to own office (set_user_companies)', async () => {
  const r = await as(CA, `select * from public.set_user_companies('${NEWBIE}', array['${HO}']::uuid[])`);
  if (r.rows.length !== 1) throw new Error('expected 1 membership, got ' + r.rows.length);
});
await check('Company Admin cannot assign invitee to another office', () =>
  as(CA, `select * from public.set_user_companies('${NEWBIE}', array['${HO}','${DQ}']::uuid[])`), true);
await check('set_user_companies keeps memberships in offices the admin does not manage', async () => {
  await db.query(`insert into public.company_members (user_id, company_id) values ('${NEWBIE}','${DQ}')`);
  await as(CA, `select * from public.set_user_companies('${NEWBIE}', array['${HO}','${DQ}']::uuid[])`);
  await as(CA, `select * from public.set_user_companies('${NEWBIE}', array['${HO}']::uuid[])`);
  const r = await db.query(`select company_id from public.company_members where user_id = '${NEWBIE}' order by 1`);
  await db.query(`delete from public.company_members where user_id = '${NEWBIE}' and company_id = '${DQ}'`);
  if (r.rows.length !== 2) throw new Error('expected HO+DQ kept, got ' + r.rows.length);
});
await check('Company Admin cannot give a Super Admin office memberships', () =>
  as(CA, `insert into public.company_members (user_id, company_id) values ('${SA}','${HO}')`), 'Super Admin');
await check('Viewer cannot call set_user_companies', () =>
  as(NEWBIE, `select * from public.set_user_companies('${NEWBIE}', array['${DQ}']::uuid[])`), 'Permission denied');

// Global permission tables
await check('Company Admin cannot edit role_permissions', () =>
  as(CA, `insert into public.role_permissions (role, module, action) values ('Viewer','payroll','delete')`), true);
await check('Company Admin cannot edit approval_limits', () =>
  asChanged(CA, `update public.approval_limits set max_amount = null where role = 'Fleet Manager'`), 'no rows changed');
await check('Super Admin can edit approval_limits', () =>
  asChanged(SA, `update public.approval_limits set max_amount = 500 where role = 'Fleet Manager' and module = 'maintenance'`));

// Super Admin
await check('Super Admin can manage users in any office', () =>
  asChanged(SA, `update public.profiles set role = 'Viewer' where id = '${OTHER}'`));
await check('Last active Super Admin cannot demote self', () =>
  as(SA, `update public.profiles set role = 'Viewer' where id = '${SA}'`), 'last active Super Admin');
await check('Inactive Super Admin loses all access', async () => {
  await db.query(`update public.profiles set status = 'inactive' where id = '${SA}'`);
  const r = await as(SA, `select public.is_super_admin() as s, public.has_perm('vehicles','view') as v`);
  await db.query(`update public.profiles set status = 'active' where id = '${SA}'`);
  if (r.rows[0].s || r.rows[0].v) throw new Error('inactive SA still privileged');
});
await check('anon cannot read profiles', async () => {
  await db.exec(`set role anon;`);
  try { await db.query(`select * from public.profiles`); } finally { await db.exec('reset role;'); }
}, true);

let failed = 0;
for (const [s, n, d] of results) { if (s === 'FAIL') failed++; console.log(`${s} ${n}${d && s === 'FAIL' ? `\n     ${d}` : ''}`); }
console.log(`\nauth tests: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
