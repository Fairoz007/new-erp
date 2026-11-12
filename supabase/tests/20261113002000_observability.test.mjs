// Observability: client_errors (report own, Super Admin reads, caps, rate limit, purge) and app_health.
// Migration 20261113002000_observability.sql
// Standalone: node supabase/tests/20261113002000_observability.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, as, tx, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, VIEWER, FLEET } = IDS;
const report = (uid, extra = '') => as(uid, `insert into client_errors (kind, page, message${extra ? ', ' + extra.split('=')[0] : ''}) values ('error', 'invoices', 'boom'${extra ? ', ' + extra.split('=').slice(1).join('=') : ''})`);

await check('a signed-in user can report an error', async () => { await report(VIEWER); return 'ok'; });
await check('a report cannot be filed in another user\'s name', () => report(VIEWER, `user_id='${FLEET}'`), 'row-level security');
await check('anon cannot report', () => db.exec(`set role anon; insert into client_errors (message) values ('x'); reset role;`).finally(() => db.exec('reset role')), 'permission denied');
await check('users cannot read reports (own included)', async () => {
  const r = await as(VIEWER, `select count(*)::int n from client_errors`); assert(r.rows[0].n === 0, r.rows[0].n); return '0';
});
await check('a Super Admin can read every report', async () => {
  const r = await as(ADMIN, `select count(*)::int n from client_errors`); assert(r.rows[0].n === 1, r.rows[0].n); return '1';
});
await check('no update or delete for users', () => as(ADMIN, `delete from client_errors`), 'permission denied');
await check('message length is capped', () => as(VIEWER, `insert into client_errors (message) values (repeat('x', 3000))`), 'check constraint');
await check('the client cannot backdate a report', async () => {
  await as(FLEET, `insert into client_errors (message, occurred_at) values ('old', now() - interval '1 year')`);
  const r = await asServer(`select occurred_at > now() - interval '1 minute' fresh from client_errors where message = 'old'`);
  assert(r.rows[0].fresh, 'backdated'); return 'now()';
});
await check('more than 30 reports a minute are refused', async () => {
  for (let i = 0; i < 29; i++) await as(FLEET, `insert into client_errors (message) values ('loop ${i}')`);
  try { await as(FLEET, `insert into client_errors (message) values ('one too many')`); } catch (e) { assert(/Too many/.test(e.message), e.message); return 'refused at 31'; }
  throw new Error('31st report accepted');
});
await check('purge removes old reports; only Super Admin may call it', async () => {
  await asServer(`alter table client_errors disable trigger client_errors_rate_limit;
    insert into client_errors (user_id, message, occurred_at) values ('${VIEWER}', 'ancient', now() - interval '200 days');
    alter table client_errors enable trigger client_errors_rate_limit;`);
  let refused = false;
  try { await as(VIEWER, `select purge_client_errors(90)`); } catch { refused = true; }
  assert(refused, 'viewer purged');
  const n = (await as(ADMIN, `select purge_client_errors(90) n`)).rows[0].n;
  assert(n === 1, 'purged ' + n); return 'purged 1';
});
await check('app_health: refused for anon, error counts only for Super Admin', async () => {
  await db.exec(`set role anon`);
  let refused = false;
  try { await db.query(`select app_health()`); } catch { refused = true; } finally { await db.exec('reset role'); }
  assert(refused, 'anon could call app_health');
  const a = (await as(ADMIN, `select app_health() h`)).rows[0].h;
  assert(a.ok === true && a.client_errors_24h >= 1, JSON.stringify(a));
  const v = (await as(VIEWER, `select app_health() h`)).rows[0].h;
  assert(v.client_errors_24h === null, JSON.stringify(v)); return 'ok';
});
await check('system_health: Super Admin only', () => as(VIEWER, `select system_health()`), 'Permission denied');
await check('system_health: returns its sections for a Super Admin', async () => {
  const h = (await as(ADMIN, `select system_health() h`)).rows[0].h;
  assert('migrations' in h && 'cron_jobs' in h && 'buckets' in h && h.client_errors_7d >= 1, JSON.stringify(h)); return JSON.stringify(Object.keys(h));
});

t.report();
