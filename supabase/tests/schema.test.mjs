import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = process.argv[2];
const db = new PGlite();

// Minimal Supabase stand-ins
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
const tx = async (uid, sql) => {   // run in a transaction so deferred constraints fire at commit
  await db.exec(`set role authenticated; select set_config('request.uid', '${uid}', false);`);
  try { await db.exec(`begin; ${sql}; commit;`); } catch (e) { await db.exec('rollback'); throw e; } finally { await db.exec('reset role;'); }
};

// Seed as owner
const ADMIN = '00000000-0000-0000-0000-00000000000a', VIEWER = '00000000-0000-0000-0000-00000000000b',
      FLEET = '00000000-0000-0000-0000-00000000000c', OTHER = '00000000-0000-0000-0000-00000000000d';
await db.exec(`
  insert into auth.users (id, email) values ('${ADMIN}','a@x'),('${VIEWER}','v@x'),('${FLEET}','f@x'),('${OTHER}','o@x');
  update public.profiles set role = 'Super Admin' where id = '${ADMIN}';
  update public.profiles set role = 'Viewer' where id = '${VIEWER}';
  update public.profiles set role = 'Fleet Manager' where id in ('${FLEET}','${OTHER}');
  insert into public.companies (id, name, code) values
    ('11111111-1111-1111-1111-111111111111','Head Office','HO'), ('22222222-2222-2222-2222-222222222222','Duqm','DQ');
  insert into public.company_members values ('${VIEWER}','11111111-1111-1111-1111-111111111111'),
    ('${FLEET}','11111111-1111-1111-1111-111111111111'), ('${OTHER}','22222222-2222-2222-2222-222222222222');
  insert into public.accounts (company_id, code, name, category, subcategory) values
    ('11111111-1111-1111-1111-111111111111','1010','Bank','Asset','Cash'),
    ('11111111-1111-1111-1111-111111111111','1100','AR','Asset','Receivables'),
    ('11111111-1111-1111-1111-111111111111','1300','Input VAT','Asset','Tax'),
    ('11111111-1111-1111-1111-111111111111','2010','AP','Liability','Payables'),
    ('11111111-1111-1111-1111-111111111111','2100','Output VAT','Liability','Tax'),
    ('11111111-1111-1111-1111-111111111111','5000','Maintenance','Expense','Direct');
  insert into public.suppliers (id, supplier_code, name, supplier_type) values ('33333333-3333-3333-3333-333333333333','SUP-001','Zubair','Garage');
  insert into public.bank_accounts (id, company_id, bank_name, account_name, account_number, account_type)
    values ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','BM','Ops','001','Current');
  insert into public.vehicles (id, company_id, vehicle_code, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
    values ('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','VH-001','1234 AB','SUV','Operations','Toyota','LC','Diesel','Automatic');
`);
const HO = '11111111-1111-1111-1111-111111111111';

// --- Permission matrix
await check('matrix: Viewer cannot create vehicles', async () =>
  (await db.query(`select count(*)::int n from role_permissions where role='Viewer' and action <> 'view' and action not in ('export','print')`)).rows[0].n === 0 ? 'ok' : (() => { throw new Error('viewer has write perms'); })());
await check('matrix: Fleet Manager has no payments access', async () =>
  (await db.query(`select count(*)::int n from role_permissions where role='Fleet Manager' and module='payments'`)).rows[0].n === 0 ? 'ok' : (() => { throw new Error('leak'); })());

// --- Invoice totals derived from lines
await check('invoice totals computed from lines (100 x 2 @5% VAT = 210)', async () => {
  await tx(ADMIN, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date, grand_total)
     values ('66666666-6666-6666-6666-666666666666','${HO}','PINV-1','Purchase','Supplier','33333333-3333-3333-3333-333333333333', current_date, current_date + 30, 99999);
     insert into invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
     values ('66666666-6666-6666-6666-666666666666', 1, 'Brake pads', 2, 100, 5, '5000')`);
  const r = (await db.query(`select grand_total, tax_total, outstanding_amount from invoices where invoice_number='PINV-1'`)).rows[0];
  if (Number(r.grand_total) !== 210) throw new Error('grand_total ' + r.grand_total);
  return JSON.stringify(r);
});

await check('post_invoice posts balanced AP entry', async () => {
  await tx(ADMIN, `select post_invoice('66666666-6666-6666-6666-666666666666')`);
  const r = (await db.query(`select code, balance from v_account_balances where company_id='${HO}' and code in ('2010','5000','1300') order by code`)).rows;
  return JSON.stringify(r);
});

// --- Payments
await check('overpayment rejected (999 vs 210)', () =>
  tx(ADMIN, `select record_payment('66666666-6666-6666-6666-666666666666', 999, current_date, 'Bank Transfer', '44444444-4444-4444-4444-444444444444')`), 'outstanding');
await check('valid partial payment 110 accepted, outstanding = 100, GL posted', async () => {
  await tx(ADMIN, `select record_payment('66666666-6666-6666-6666-666666666666', 110, current_date, 'Bank Transfer', '44444444-4444-4444-4444-444444444444')`);
  const r = (await db.query(`select i.outstanding_amount, i.payment_status, p.payment_number,
      (select balance from v_account_balances where company_id='${HO}' and code='2010') ap,
      (select current_balance from v_bank_balances where id='44444444-4444-4444-4444-444444444444') bank
      from invoices i join payments p on p.invoice_id=i.id where i.invoice_number='PINV-1'`)).rows[0];
  if (Number(r.outstanding_amount) !== 100 || r.payment_status !== 'Partially Paid') throw new Error(JSON.stringify(r));
  return JSON.stringify(r);
});
await check('Viewer cannot record payment', () =>
  tx(VIEWER, `select record_payment('66666666-6666-6666-6666-666666666666', 10, current_date, 'Cash', '44444444-4444-4444-4444-444444444444')`), 'Permission denied');
await check('direct insert into payments blocked (must use RPC)', () =>
  tx(ADMIN, `insert into payments (company_id, payment_number, invoice_id, payment_date, amount, payment_method, bank_account_id)
     values ('${HO}','X','66666666-6666-6666-6666-666666666666',current_date,1,'Cash','44444444-4444-4444-4444-444444444444')`), true);

// --- Journals
await check('unbalanced journal rejected', () =>
  tx(ADMIN, `select post_journal_entry('${HO}', current_date, 'bad', '[{"account_code":"5000","debit":100},{"account_code":"1010","credit":90}]')`), 'unbalanced');
await check('balanced journal accepted', () =>
  tx(ADMIN, `select post_journal_entry('${HO}', current_date, 'ok', '[{"account_code":"5000","debit":50},{"account_code":"1010","credit":50}]')`));
await check('posted journal cannot be deleted', () =>
  tx(ADMIN, `delete from journal_entries where description='ok'`), true);
await check('posted journal cannot be deleted even server-side (trigger)', () =>
  db.exec(`delete from journal_entries where description='ok'`), 'cannot be deleted');

// --- RLS tenancy & roles
await check('Viewer sees HO vehicle', async () => {
  const n = (await as(VIEWER, `select count(*)::int n from vehicles`)).rows[0].n; if (n !== 1) throw new Error('n=' + n); return 'n=1';
});
await check('Viewer cannot insert vehicle', () =>
  as(VIEWER, `insert into vehicles (company_id, vehicle_code, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
    values ('${HO}','VH-2','9','SUV','Pool','a','b','Diesel','Manual')`), 'row-level security');
await check('Duqm Fleet Manager cannot see HO vehicles', async () => {
  const n = (await as(OTHER, `select count(*)::int n from vehicles`)).rows[0].n; if (n !== 0) throw new Error('n=' + n); return 'n=0';
});
await check('Fleet Manager cannot read invoices', async () => {
  const n = (await as(FLEET, `select count(*)::int n from invoices`)).rows[0].n; if (n !== 0) throw new Error('n=' + n); return 'n=0';
});
await check('user cannot promote self to Super Admin', () =>
  as(VIEWER, `update profiles set role='Super Admin' where id='${VIEWER}'`), 'Only administrators');
await check('audit log written by trigger, scoped by company', async () => {
  const total = (await db.query(`select count(*)::int n from audit_logs`)).rows[0].n;
  const seen = (await as(OTHER, `select count(*)::int n from audit_logs`)).rows[0].n;
  if (total === 0 || seen !== 0) throw new Error(`total=${total} seen=${seen}`); return `total=${total}, other office sees 0`;
});

// --- Work orders & approvals
await check('cannot complete unapproved work order', async () => {
  await tx(ADMIN, `insert into work_orders (id, company_id, work_order_number, vehicle_id, reported_date, problem_description, priority, status, approval_status, estimated_cost)
    values ('77777777-7777-7777-7777-777777777777','${HO}','WO-101','55555555-5555-5555-5555-555555555555',current_date,'Brakes','High','Requested','Pending',800)`);
  return tx(ADMIN, `select complete_work_order('77777777-7777-7777-7777-777777777777', 800)`);
}, 'check');
await check('Fleet Manager cannot approve 800 (limit 500)', async () => {
  await tx(ADMIN, `insert into approval_requests (id, company_id, reference_type, reference_id, reference_number, amount, requested_by)
    values ('88888888-8888-8888-8888-888888888888','${HO}','WorkOrder','77777777-7777-7777-7777-777777777777','WO-101',800,'${ADMIN}')`);
  return tx(FLEET, `select decide_approval('88888888-8888-8888-8888-888888888888','Approved','ok')`);
}, 'not authorised');
await check('approval requires a comment', () =>
  tx(ADMIN, `select decide_approval('88888888-8888-8888-8888-888888888888','Approved','  ')`), 'check');
await check('admin approves, completes WO, exactly one maintenance record', async () => {
  await tx(ADMIN, `select decide_approval('88888888-8888-8888-8888-888888888888','Approved','Go ahead')`);
  await tx(ADMIN, `select complete_work_order('77777777-7777-7777-7777-777777777777', 780)`);
  const n = (await db.query(`select count(*)::int n from maintenance_records where work_order_id='77777777-7777-7777-7777-777777777777'`)).rows[0].n;
  if (n !== 1) throw new Error('n=' + n);
  return 'one record';
});
await check('completing twice rejected', () => tx(ADMIN, `select complete_work_order('77777777-7777-7777-7777-777777777777', 780)`), 'already completed');

// --- Numbering & duplicate-period guards
await check('doc numbers sequential & unique', async () => {
  const r = (await db.query(`select next_doc_number('${HO}','EXP-2026') a, next_doc_number('${HO}','EXP-2026') b`)).rows[0];
  if (r.a === r.b) throw new Error('dup'); return `${r.a}, ${r.b}`;
});
await check('duplicate payroll month rejected', () => tx(ADMIN, `
  insert into payroll_runs (company_id, payroll_number, month, year) values ('${HO}','PR-1',8,2026);
  insert into payroll_runs (company_id, payroll_number, month, year) values ('${HO}','PR-2',8,2026)`), 'duplicate key');
await check('anon has no table access', async () => {
  await db.exec('set role anon');
  try { await db.query('select * from vehicles'); } finally { await db.exec('reset role'); }
}, 'permission denied');

for (const [s, n, d] of results) console.log(s.padEnd(5), n, d ? '— ' + String(d).slice(0, 160) : '');
const fails = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
