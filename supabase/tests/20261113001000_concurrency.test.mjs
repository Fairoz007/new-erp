// Optimistic locking (updated_at check) and idempotent saves (x-request-key).
// Migration 20261113001000_concurrency.sql
// Standalone: node supabase/tests/20261113001000_concurrency.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, as, tx, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, FLEET, HO } = IDS;
const VEH = '55555555-5555-5555-5555-555555555555';
const SUP = '33333333-3333-3333-3333-333333333333';
const BANK = '44444444-4444-4444-4444-444444444444';
const KEY = '0b8e6c1e-1111-4a5b-9c3d-000000000001';
const withKey = (key, sql) => `select set_config('request.headers', '{"x-request-key":"${key}"}', true); ${sql}`;
const ts = async (sql) => (await asServer(sql)).rows[0];

// ---------------------------------------------------------------- optimistic locking
await check('an update with the version the user loaded succeeds and moves updated_at', async () => {
  const before = (await ts(`select updated_at::text u from vehicles where id = '${VEH}'`)).u;
  await tx(FLEET, `update vehicles set color = 'White', updated_at = '${before}' where id = '${VEH}'`);
  const after = (await ts(`select updated_at::text u, color from vehicles where id = '${VEH}'`));
  assert(after.color === 'White' && after.u > before, JSON.stringify(after)); return 'ok';
});
await check('a second user saving from an older copy is refused with PT409', async () => {
  const loaded = (await ts(`select updated_at::text u from vehicles where id = '${VEH}'`)).u;
  await tx(ADMIN, `update vehicles set color = 'Red' where id = '${VEH}'`);           // someone else saves first
  try { await tx(FLEET, `update vehicles set color = 'Blue', updated_at = '${loaded}' where id = '${VEH}'`); }
  catch (e) { assert(e.code === 'PT409' && /changed by someone else/.test(e.message), e.code + e.message);
    const c = (await ts(`select color from vehicles where id = '${VEH}'`)).color; assert(c === 'Red', c); return 'refused, Red kept'; }
  throw new Error('stale save accepted');
});
await check('an update without a version is not checked (server functions, old clients)', async () => {
  await tx(ADMIN, `update vehicles set color = 'Green' where id = '${VEH}'`); return 'ok';
});
await check('employees, tyres and accidents now carry updated_at', async () => {
  const r = (await asServer(`select count(*)::int n from information_schema.columns where table_schema = 'public'
    and column_name = 'updated_at' and table_name in ('employees', 'tyres', 'accidents')`)).rows[0].n;
  assert(r === 3, r); return '3';
});
await check('locking trigger is on every edited table', async () => {
  const r = (await asServer(`select string_agg(c.relname, ',' order by c.relname) t from pg_trigger g join pg_class c on c.oid = g.tgrelid where g.tgname = 'a0_version_check'`)).rows[0].t;
  for (const x of ['vehicles', 'invoices', 'employees', 'suppliers', 'customers', 'companies']) assert(r.includes(x), 'missing ' + x);
  return r;
});

// ---------------------------------------------------------------- idempotency
const inv = '66666666-6666-6666-6666-000000000101';
await tx(ADMIN, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date, reference_number)
    values ('${inv}','${HO}','IDEM-1','Purchase','Supplier','${SUP}', current_date, current_date + 30, 'IDEM-R1');
  insert into invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
    values ('${inv}', 1, 'Parts', 1, 100, 5, '5000')`);
await tx(ADMIN, `select post_invoice('${inv}')`);

await check('a payment saved with a request key (payment + its journal in one transaction)', async () => {
  await tx(ADMIN, withKey(KEY, `select record_payment('${inv}', 50, current_date, 'Bank Transfer', '${BANK}')`));
  const n = (await ts(`select count(*)::int n from payments where invoice_id = '${inv}'`)).n;
  assert(n === 1, n); return '1 payment';
});
await check('the same request sent again (retry / double click) is refused, nothing duplicated', async () => {
  try { await tx(ADMIN, withKey(KEY, `select record_payment('${inv}', 50, current_date, 'Bank Transfer', '${BANK}')`)); }
  catch (e) {
    assert(e.code === 'PT409' && /already saved/.test(e.message), e.message);
    const r = await ts(`select count(*)::int n, (select outstanding_amount from invoices where id = '${inv}') o from payments where invoice_id = '${inv}'`);
    assert(r.n === 1 && Number(r.o) === 55, JSON.stringify(r)); return 'refused; outstanding 55';
  }
  throw new Error('duplicate accepted');
});
await check('a new request key saves a second, intended payment', async () => {
  await tx(ADMIN, withKey('0b8e6c1e-1111-4a5b-9c3d-000000000002', `select record_payment('${inv}', 5, current_date, 'Cash', '${BANK}')`));
  return 'ok';
});
await check('an expense insert with a used key is refused', async () => {
  const k = '0b8e6c1e-1111-4a5b-9c3d-000000000003';
  const sql = `insert into expenses (company_id, vehicle_id, date, category, description, quantity, unit_price, tax, total, payment_method)
    values ('${HO}','${VEH}',current_date,'Fuel','Diesel',1,10,0,10,'Cash')`;
  await tx(FLEET, withKey(k, sql));
  try { await tx(FLEET, withKey(k, sql)); } catch (e) { assert(e.code === 'PT409', e.message); return 'refused'; }
  throw new Error('duplicate expense');
});
await check('a malformed key is ignored (no claim, insert proceeds)', async () => {
  await tx(FLEET, `select set_config('request.headers', '{"x-request-key":"not-a-uuid"}', true);
    insert into expenses (company_id, vehicle_id, date, category, description, quantity, unit_price, tax, total, payment_method)
    values ('${HO}','${VEH}',current_date,'Fuel','Diesel',1,10,0,10,'Cash')`);
  return 'ok';
});
await check('request_keys is not readable by users', () => as(ADMIN, `select * from request_keys`), 'permission denied');

t.report();
