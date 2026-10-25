// Core schema tests (migrations 000000-000200) and the entry point for .
// After its own checks this file runs every other supabase/tests/*.test.mjs in a child
// process (fresh in-memory DB each) and fails if any of them fails.
// Run a single file: node supabase/tests/<file>.test.mjs supabase/migrations
// Only some files:   TEST_ONLY=platform,finance npm run test:db
import { spawnSync } from 'child_process';
import { readdirSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { setup, seedFixtures, IDS } from './harness.mjs';

const dir = process.argv[2] || 'supabase/migrations';
const { db, check, as, tx, report: printReport, results } = await setup(dir);
await seedFixtures(db);
const { ADMIN, VIEWER, FLEET, OTHER, HO } = IDS;

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


// ---------------------------------------------------------------------
// Print own results, then run the other test files
// ---------------------------------------------------------------------
for (const [s, n, d] of results) console.log(s.padEnd(5), n, d ? '— ' + String(d).slice(0, 160) : '');
const ownFails = results.filter(r => r[0] === 'FAIL').length;
console.log();

const here = dirname(fileURLToPath(import.meta.url));
const only = (process.env.TEST_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const files = readdirSync(here).filter(f => f.endsWith('.test.mjs') && f !== basename(fileURLToPath(import.meta.url)))
  .filter(f => !only.length || only.some(o => f.startsWith(o))).sort();
const summary = [['schema.test.mjs', ownFails ? 'FAIL' : 'PASS']];
for (const f of files) {
  console.log();
  const r = spawnSync(process.execPath, [join(here, f), dir], { stdio: 'inherit' });
  summary.push([f, r.status === 0 ? 'PASS' : 'FAIL']);
}
console.log('
===== test:db summary =====');
for (const [f, s] of summary) console.log(s.padEnd(5), f);
process.exit(summary.some(([, s]) => s === 'FAIL') ? 1 : 0);
