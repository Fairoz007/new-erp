// Agent D (System) tests: approval/expiry notifications, idempotency, read state, actor names.
// Usage: node supabase/tests/20261026000400_system.test.mjs supabase/migrations
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
  try { await db.exec(readFileSync(join(dir, f), 'utf8')); console.log('OK   migration', f); }
  catch (e) { console.log('FAIL migration', f, '\n  ', e.message); process.exit(1); }
}

const results = [];
const check = async (name, fn, expectError) => {
  try { const r = await fn(); results.push([expectError ? 'FAIL' : 'PASS', name, expectError ? 'expected error, got success' : (r ?? '')]); }
  catch (e) { results.push([expectError && (expectError === true || e.message.includes(expectError)) ? 'PASS' : 'FAIL', name, e.message]); }
};
const as = async (uid, sql, params) => {
  await db.exec(`set role authenticated; select set_config('request.uid', '${uid}', false);`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
};
const tx = async (uid, sql) => {
  await db.exec(`set role authenticated; select set_config('request.uid', '${uid}', false);`);
  try { await db.exec(`begin; ${sql}; commit;`); } catch (e) { await db.exec('rollback'); throw e; } finally { await db.exec('reset role;'); }
};
const count = async (sql) => Number((await db.query(sql)).rows[0].n);
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const ADMIN = '00000000-0000-0000-0000-00000000000a', VIEWER = '00000000-0000-0000-0000-00000000000b',
      FLEET = '00000000-0000-0000-0000-00000000000c', FIN = '00000000-0000-0000-0000-00000000000e',
      OTHER = '00000000-0000-0000-0000-00000000000d';
const HO = '11111111-1111-1111-1111-111111111111', DQ = '22222222-2222-2222-2222-222222222222';
await db.exec(`
  insert into auth.users (id, email) values ('${ADMIN}','a@x'),('${VIEWER}','v@x'),('${FLEET}','f@x'),('${OTHER}','o@x'),('${FIN}','fin@x');
  update public.profiles set role = 'Super Admin' where id = '${ADMIN}';
  update public.profiles set role = 'Viewer' where id = '${VIEWER}';
  update public.profiles set role = 'Fleet Manager' where id in ('${FLEET}');
  update public.profiles set role = 'Finance Manager' where id in ('${FIN}','${OTHER}');
  insert into public.companies (id, name, code) values ('${HO}','Head Office','HO'), ('${DQ}','Duqm','DQ');
  insert into public.company_members values ('${VIEWER}','${HO}'), ('${FLEET}','${HO}'), ('${FIN}','${HO}'), ('${OTHER}','${DQ}');
`);

// --- approval notifications
const REQ = '99999999-9999-9999-9999-999999999991', REF = '99999999-9999-9999-9999-999999999992';
await check('new approval request notifies eligible approvers only (not requester, viewer, other company)', async () => {
  await tx(FLEET, `insert into approval_requests (id, company_id, reference_type, reference_id, reference_number, amount, total_levels, required_roles, requested_by)
    values ('${REQ}','${HO}','Expense','${REF}','EXP-2026-0001', 250, 1, '{}', '${FLEET}')`);
  const rows = (await db.query(`select user_id from notifications where type='approval_required' order by user_id`)).rows.map(r => r.user_id);
  assert(rows.includes(ADMIN) && rows.includes(FIN), 'admin and finance manager of HO must be notified: ' + rows);
  assert(!rows.includes(FLEET) && !rows.includes(VIEWER) && !rows.includes(OTHER), 'unexpected recipient: ' + rows);
  return rows.length + ' recipients';
});
await check('requester name copied onto request', async () => {
  const r = (await db.query(`select requested_by_name n from approval_requests where id='${REQ}'`)).rows[0];
  assert(r.n, 'name missing'); return r.n;
});
await check('approver sees only own notifications (RLS)', async () => {
  const rows = (await as(FIN, `select user_id from notifications`)).rows;
  assert(rows.length === 1 && rows[0].user_id === FIN, 'FIN sees ' + rows.length);
});
await check('client insert into notifications denied', () =>
  tx(ADMIN, `insert into notifications (company_id, type, title, message, severity) values ('${HO}','x','t','m','info')`), true);

await check('decide_approval -> requester notified once, approver name recorded', async () => {
  await tx(FIN, `select decide_approval('${REQ}', 'Approved', 'ok per budget')`);
  const n = await count(`select count(*) n from notifications where user_id='${FLEET}' and dedupe_key like 'approval-decided:%'`);
  assert(n === 1, 'requester notifications ' + n);
  const a = (await db.query(`select approver_name from approval_actions where request_id='${REQ}'`)).rows[0];
  assert(a && a.approver_name, 'approver_name missing');
  return a.approver_name;
});
await check('decide_approval requires a comment', () =>
  tx(FLEET, `insert into approval_requests (id, company_id, reference_type, reference_id, reference_number, amount, requested_by)
             values ('99999999-9999-9999-9999-999999999993','${HO}','Expense','${REF}','EXP-2',10,'${FLEET}')`)
    .then(() => tx(ADMIN, `select decide_approval('99999999-9999-9999-9999-999999999993','Approved','   ')`)), true);
await check('audit_logs rows carry the actor name', async () => {
  const n = await count(`select count(*) n from audit_logs where user_id is not null and user_name is not null`);
  assert(n > 0, 'no named audit rows'); return n + ' rows';
});

// --- expiry notifications
await db.exec(`
  insert into vehicles (id, company_id, vehicle_code, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission,
                        registration_expiry_date, insurance_expiry_date)
  values ('55555555-5555-5555-5555-555555555555','${HO}','VH-001','1234 AB','SUV','Operations','Toyota','LC','Diesel','Automatic',
          current_date - 5, current_date + 10),
         ('55555555-5555-5555-5555-555555555556','${HO}','VH-002','9999 ZZ','SUV','Operations','Toyota','LC','Diesel','Automatic',
          current_date + 200, current_date + 200);
  insert into documents (company_id, document_name, category, expiry_date) values ('${HO}','Trade licence','Legal', current_date + 3);
`);
await check('refresh_expiry_notifications creates alerts for expired/expiring only', async () => {
  const n = (await db.query(`select refresh_expiry_notifications(30) n`)).rows[0].n;
  assert(Number(n) === 3, 'expected 3 (reg expired, ins soon, doc soon), got ' + n);
  const sev = (await db.query(`select type, severity from notifications where type in ('registration_expiring','insurance_expiring','document_expiry') order by type`)).rows;
  assert(sev.find(r => r.type === 'registration_expiring').severity === 'critical', 'expired registration must be critical');
  return JSON.stringify(sev);
});
await check('refresh is idempotent (second run creates nothing)', async () => {
  const n = (await db.query(`select refresh_expiry_notifications(30) n`)).rows[0].n;
  assert(Number(n) === 0, 'duplicates created: ' + n);
});
await check('renewed expiry date produces a fresh alert', async () => {
  await db.exec(`update vehicles set insurance_expiry_date = current_date + 20 where id='55555555-5555-5555-5555-555555555555'`);
  const n = (await db.query(`select refresh_expiry_notifications(30) n`)).rows[0].n;
  assert(Number(n) === 1, 'expected 1, got ' + n);
});
await check('clients cannot call refresh_expiry_notifications', () => as(ADMIN, `select refresh_expiry_notifications(30)`), true);
await check('run_expiry_notifications: Viewer denied', () => as(VIEWER, `select run_expiry_notifications()`), 'Permission denied');
await check('run_expiry_notifications: Super Admin allowed', async () => {
  const r = await as(ADMIN, `select run_expiry_notifications() n`);
  assert(Number(r.rows[0].n) === 0, 'idempotent');
});

// --- read state
await check('company-wide alert visible to member, hidden from other company', async () => {
  const a = (await as(VIEWER, `select count(*)::int n from notifications where type='registration_expiring'`)).rows[0].n;
  const b = (await as(OTHER, `select count(*)::int n from notifications where type='registration_expiring'`)).rows[0].n;
  assert(a === 1 && b === 0, `member ${a}, other ${b}`);
});
await check('mark_all_notifications_read is per-user and idempotent', async () => {
  const first = (await as(VIEWER, `select mark_all_notifications_read() n`)).rows[0].n;
  const second = (await as(VIEWER, `select mark_all_notifications_read() n`)).rows[0].n;
  assert(Number(first) > 0 && Number(second) === 0, `first ${first} second ${second}`);
  const unreadViewer = (await as(VIEWER, `select count(*)::int n from notifications n where not exists (select 1 from notification_reads r where r.notification_id=n.id)`)).rows[0].n;
  const unreadFleet = (await as(FLEET, `select count(*)::int n from notifications n where not exists (select 1 from notification_reads r where r.notification_id=n.id)`)).rows[0].n;
  assert(unreadViewer === 0 && unreadFleet > 0, `viewer unread ${unreadViewer}, fleet unread ${unreadFleet}`);
});
await check('a user cannot write another user read state', () =>
  tx(VIEWER, `insert into notification_reads (notification_id, user_id) select id, '${FLEET}' from notifications limit 1`), true);

for (const [s, n, d] of results) console.log(s.padEnd(5), n, d ? '— ' + String(d).slice(0, 160) : '');
const fails = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
