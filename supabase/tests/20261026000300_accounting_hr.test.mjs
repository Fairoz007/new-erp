// Accounting / fixed assets / payroll tests (Agent C, migration 20261026000300_accounting_hr.sql).
// Standalone: node supabase/tests/20261026000300_accounting_hr.test.mjs supabase/migrations
// Applies every migration to an in-memory PGlite and exercises run_depreciation / process_payroll,
// their permission checks and the guards around ledger-affecting rows.
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
  try { const r = await fn(); results.push([expectError ? 'FAIL' : 'PASS', name, expectError ? `expected error, got ${JSON.stringify(r ?? 'success')}` : (r ?? '')]); }
  catch (e) { results.push([expectError && (expectError === true || e.message.includes(expectError)) ? 'PASS' : 'FAIL', name, e.message]); }
};
const as = async (uid, sql) => {
  await db.exec(`set role authenticated; select set_config('request.uid', '${uid}', false);`);
  try { return await db.query(sql); }
  finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); }
};
// transaction so the deferred double-entry constraint fires at commit
const tx = async (uid, sql) => {
  await db.exec(`set role authenticated; select set_config('request.uid', '${uid}', false);`);
  try { await db.exec(`begin; ${sql}; commit;`); }
  catch (e) { await db.exec('rollback'); throw e; }
  finally { await db.exec(`reset role; select set_config('request.uid', '', false);`); }
};
const one = async (sql) => (await db.query(sql)).rows[0];
const eq = (label, got, want) => { if (Math.abs(Number(got) - want) > 0.0005) throw new Error(`${label}: got ${got}, want ${want}`); };

const SA = '00000000-0000-0000-0000-0000000000c1', FM = '00000000-0000-0000-0000-0000000000c2',
      ACC = '00000000-0000-0000-0000-0000000000c3', VIEW = '00000000-0000-0000-0000-0000000000c4',
      OTHER = '00000000-0000-0000-0000-0000000000c5', MGMT = '00000000-0000-0000-0000-0000000000c6';
const HO = '11111111-1111-1111-1111-1111111111c1', DQ = '22222222-2222-2222-2222-2222222222c2';
const BANK = '44444444-4444-4444-4444-4444444444c1', DQBANK = '44444444-4444-4444-4444-4444444444c2';

// Chart of accounts as seeded from INITIAL_CHART_OF_ACCOUNTS (only the codes used here).
const coa = (cid) => `
  insert into public.accounts (company_id, code, name, category, subcategory, opening_balance) values
    ('${cid}','1020','Bank - Bank Muscat Corporate','Asset','Current Assets', 10000),
    ('${cid}','1510','Motor Vehicles Fleet at Cost','Asset','Fixed Assets', 0),
    ('${cid}','1520','Accumulated Depreciation - Motor Vehicles','Asset','Fixed Assets', 0),
    ('${cid}','1530','Workshop Tools & Diagnostic Equipment','Asset','Fixed Assets', 0),
    ('${cid}','2030','Accrued Operational Expenses','Liability','Current Liabilities', 0),
    ('${cid}','3010','Shareholder Capital','Equity','Equity', 10000),
    ('${cid}','5070','Driver Allowances & Logistics Staff','Expense','Operating Expense', 0),
    ('${cid}','5080','Depreciation Expense - Motor Vehicles','Expense','Depreciation', 0)
  on conflict (company_id, code) do nothing;`;

await db.exec(`
  select set_config('request.uid', '', false);
  insert into auth.users (id, email) values ('${SA}','sa@c'),('${FM}','fm@c'),('${ACC}','acc@c'),('${VIEW}','v@c'),('${OTHER}','o@c'),('${MGMT}','m@c');
  update public.profiles set role = 'Super Admin' where id = '${SA}';
  update public.profiles set role = 'Finance Manager' where id in ('${FM}','${OTHER}');
  update public.profiles set role = 'Accountant' where id = '${ACC}';
  update public.profiles set role = 'Viewer' where id = '${VIEW}';
  update public.profiles set role = 'Management' where id = '${MGMT}';
  insert into public.companies (id, name, code) values ('${HO}','Head Office C','CHO'), ('${DQ}','Duqm C','CDQ') on conflict do nothing;
  delete from public.company_members where user_id in ('${SA}','${FM}','${ACC}','${VIEW}','${OTHER}','${MGMT}');
  insert into public.company_members (user_id, company_id) values
    ('${FM}','${HO}'), ('${ACC}','${HO}'), ('${VIEW}','${HO}'), ('${MGMT}','${HO}'), ('${OTHER}','${DQ}');
  ${coa(HO)} ${coa(DQ)}
  insert into public.bank_accounts (id, company_id, bank_name, account_name, account_number, account_type, gl_account_code) values
    ('${BANK}','${HO}','Bank Muscat','Ops','001','Current','1020'),
    ('${DQBANK}','${DQ}','Bank Dhofar','Duqm','002','Current','1020');

  insert into public.fixed_assets (id, company_id, asset_code, name, category, purchase_date, purchase_cost, salvage_value,
      useful_life_years, annual_rate_percentage, depreciation_method, accumulated_depreciation,
      gl_asset_account, gl_expense_account, gl_accum_dep_account, status) values
    ('a0000000-0000-0000-0000-000000000001','${HO}','FA-C01','SL truck','Fleet Vehicle','2024-06-01',12000,0,5,20,'Straight-Line',0,'1510','5080','1520','Active'),
    ('a0000000-0000-0000-0000-000000000002','${HO}','FA-C02','RB lift','Workshop Equipment','2024-06-01',10000,1000,5,24,'Reducing Balance',0,'1530','5080','1520','Active'),
    ('a0000000-0000-0000-0000-000000000003','${HO}','FA-C03','DDB server','Other Fixed Asset','2024-06-01',6000,0,5,0,'Double Declining',0,'1530','5080','1520','Under Maintenance'),
    ('a0000000-0000-0000-0000-000000000004','${HO}','FA-C04','Nearly done','Workshop Equipment','2023-01-01',1000,900,1,100,'Straight-Line',95,'1530','5080','1520','Active'),
    ('a0000000-0000-0000-0000-000000000005','${HO}','FA-C05','Bought later','Workshop Equipment','2025-03-01',5000,0,5,20,'Straight-Line',0,'1530','5080','1520','Active'),
    ('a0000000-0000-0000-0000-000000000006','${HO}','FA-C06','Sold','Workshop Equipment','2024-01-01',5000,0,5,20,'Straight-Line',0,'1530','5080','1520','Disposed');

  insert into public.employees (id, company_id, employee_code, name, designation, department, joining_date, status,
      basic_salary, housing_allowance, transport_allowance, other_allowances, pasi_employee_pct, pasi_employer_pct,
      civil_id, iban) values
    ('e0000000-0000-0000-0000-000000000001','${HO}','EMP-C01','Driver One','Driver','Fleet & Logistics','2024-01-01','Active',500,100,50,0,7,11.5,'CIV1','OM01'),
    ('e0000000-0000-0000-0000-000000000002','${HO}','EMP-C02','Trainee','Mechanic','Workshop & Maintenance','2024-12-01','Probation',300,0,0,20,7,11.5,'CIV2','OM02'),
    ('e0000000-0000-0000-0000-000000000003','${HO}','EMP-C03','Left','Driver','Fleet & Logistics','2020-01-01','Terminated',400,0,0,0,7,11.5,null,null),
    ('e0000000-0000-0000-0000-000000000004','${HO}','EMP-C04','Joins later','Driver','Fleet & Logistics','2025-06-01','Active',400,0,0,0,7,11.5,null,null),
    ('e0000000-0000-0000-0000-000000000005','${DQ}','EMP-C05','Duqm staff','Driver','Fleet & Logistics','2024-01-01','Active',400,0,0,0,7,11.5,null,null);
`);

const bal = async (cid, code) => (await one(`select balance from v_account_balances where company_id='${cid}' and code='${code}'`))?.balance;
const jeBalanced = async (jeId) => {
  const r = await one(`select sum(debit) d, sum(credit) c, count(*)::int n from journal_lines where entry_id='${jeId}'`);
  if (Number(r.d) !== Number(r.c) || Number(r.d) === 0) throw new Error(`unbalanced ${r.d}/${r.c}`);
  return r;
};

// ------------------------------------------------------------------ depreciation
await check('dep: Viewer denied', () => tx(VIEW, `select run_depreciation('${HO}', '2025-01-01', null, true)`), 'Permission denied');
await check('dep: other office Finance Manager denied (foreign company)', () =>
  tx(OTHER, `select run_depreciation('${HO}', '2025-01-01', null, true)`), 'Permission denied');
await check('dep: Management (view-only) denied', () => tx(MGMT, `select run_depreciation('${HO}', '2025-01-01', null, true)`), 'Permission denied');
await check('dep: future period rejected', () => tx(FM, `select run_depreciation('${HO}', '2099-01-01', null, true)`), 'future period');

await check('dep: Jan 2025 run — SL 200 + RB 200 + DDB 200 + salvage-capped 5 = 605, balanced JE', async () => {
  await tx(FM, `select run_depreciation('${HO}', '2025-01-15', 'test', true)`);
  const run = await one(`select * from depreciation_runs where company_id='${HO}' and period='2025-01-01'`);
  eq('total', run.total_amount, 605); eq('assets', run.total_assets, 4);
  if (run.period_label !== 'January 2025') throw new Error('label ' + run.period_label);
  if (!run.journal_entry_id) throw new Error('no JE');
  const je = await one(`select date, source_module, source_id from journal_entries where id='${run.journal_entry_id}'`);
  if (String(je.date.toISOString?.() ?? je.date).slice(0, 10) !== '2025-01-31' || je.source_module !== 'Depreciation') throw new Error(JSON.stringify(je));
  await jeBalanced(run.journal_entry_id);
  eq('5080', await bal(HO, '5080'), 605); eq('1520', await bal(HO, '1520'), -605);
  const items = (await db.query(`select f.asset_code, i.depreciation_amount from depreciation_run_items i join fixed_assets f on f.id=i.asset_id where run_id='${run.id}' order by 1`)).rows;
  return `${run.batch_number}: ` + items.map(i => `${i.asset_code}=${Number(i.depreciation_amount)}`).join(', ');
});
await check('dep: asset reaching salvage is Fully Depreciated, never below salvage', async () => {
  const a = await one(`select accumulated_depreciation, current_book_value, status from fixed_assets where asset_code='FA-C04'`);
  eq('acc', a.accumulated_depreciation, 100); eq('bv', a.current_book_value, 900);
  if (a.status !== 'Fully Depreciated') throw new Error(a.status);
  return 'book value 900 = salvage';
});
await check('dep: assets bought after the period and disposed assets untouched', async () => {
  const r = (await db.query(`select asset_code, accumulated_depreciation from fixed_assets where asset_code in ('FA-C05','FA-C06')`)).rows;
  if (r.some(x => Number(x.accumulated_depreciation) !== 0)) throw new Error(JSON.stringify(r));
});
await check('dep: duplicate period rejected', () => tx(FM, `select run_depreciation('${HO}', '2025-01-01', null, true)`), 'already run');
await check('dep: Feb 2025 uses written-down value (RB 196, DDB 193.333) and skips fully depreciated', async () => {
  await tx(ACC, `select run_depreciation('${HO}', '2025-02-01', null, true)`);
  const run = await one(`select total_amount, total_assets from depreciation_runs where company_id='${HO}' and period='2025-02-01'`);
  eq('total', run.total_amount, 200 + 196 + 193.333); eq('count', run.total_assets, 3);
  eq('FA-C04 acc', (await one(`select accumulated_depreciation a from fixed_assets where asset_code='FA-C04'`)).a, 100);
});
await check('dep: run without GL posting creates no journal', async () => {
  await tx(FM, `select run_depreciation('${HO}', '2025-03-01', null, false)`);
  const r = await one(`select journal_entry_id from depreciation_runs where company_id='${HO}' and period='2025-03-01'`);
  if (r.journal_entry_id) throw new Error('JE posted');
});
await check('dep: missing per-asset GL account is reported and the run rolls back', async () => {
  await db.exec(`update fixed_assets set gl_expense_account='5999' where asset_code='FA-C01'`);
  try { await tx(FM, `select run_depreciation('${HO}', '2025-04-01', null, true)`); }
  finally { await db.exec(`update fixed_assets set gl_expense_account='5080' where asset_code='FA-C01'`); }
}, 'missing from this company');
await check('dep: rollback left no run for April', async () => {
  const n = (await one(`select count(*)::int n from depreciation_runs where company_id='${HO}' and period='2025-04-01'`)).n;
  if (n !== 0) throw new Error('n=' + n);
});
await check('dep: client cannot change accumulated depreciation directly', () =>
  as(FM, `update fixed_assets set accumulated_depreciation = 0 where asset_code='FA-C01'`), 'depreciation run');
await check('dep: client can still edit descriptive asset fields', async () => {
  const r = await as(FM, `update fixed_assets set location = 'Bay 2' where asset_code='FA-C01'`);
  if (r.affectedRows !== 1) throw new Error('rows ' + r.affectedRows);
});
await check('dep: client cannot insert depreciation runs directly', () =>
  as(FM, `insert into depreciation_runs (company_id, batch_number, period, period_label, run_date) values ('${HO}','X','2025-09-01','x',current_date)`), 'permission denied');
await check('dep: Viewer cannot read fixed assets of another office', async () => {
  const n = (await as(OTHER, `select count(*)::int n from fixed_assets where company_id='${HO}'`)).rows[0].n;
  if (n !== 0) throw new Error('n=' + n);
});

// ------------------------------------------------------------------ payroll
await check('pay: Viewer denied', () => tx(VIEW, `select process_payroll('${HO}', 2025, 1, '2025-01-28', '${BANK}', true)`), 'Permission denied');
await check('pay: Accountant (payroll view only) denied', () =>
  tx(ACC, `select process_payroll('${HO}', 2025, 1, '2025-01-28', '${BANK}', true)`), 'Permission denied');
await check('pay: other office denied (foreign company)', () =>
  tx(OTHER, `select process_payroll('${HO}', 2025, 1, '2025-01-28', '${BANK}', true)`), 'Permission denied');
await check('pay: bank account of another office rejected', () =>
  tx(FM, `select process_payroll('${HO}', 2025, 1, '2025-01-28', '${DQBANK}', true)`), 'Bank account not found');

await check('pay: Jan 2025 — 2 eligible, gross 970, PASI ee 56 / er 92, net 914; Dr 5070+5075, Cr 2040 + bank', async () => {
  await tx(FM, `select process_payroll('${HO}', 2025, 1, '2025-01-28', '${BANK}', true)`);
  const run = await one(`select * from payroll_runs where company_id='${HO}' and year=2025 and month=1`);
  if (run.status !== 'Paid' || run.payroll_number !== 'PR-2025-01' || !run.journal_entry_id) throw new Error(JSON.stringify(run));
  const t = await one(`select count(*)::int n, sum(gross_pay) g, sum(pasi_employee_deduction) ee, sum(pasi_employer_contribution) er, sum(net_pay) net
                       from payroll_items where run_id='${run.id}'`);
  if (t.n !== 2) throw new Error('items ' + t.n);
  eq('gross', t.g, 970); eq('ee', t.ee, 56); eq('er', t.er, 92); eq('net', t.net, 914);
  await jeBalanced(run.journal_entry_id);
  eq('5070', await bal(HO, '5070'), 970); eq('5075', await bal(HO, '5075'), 92);
  eq('2040', await bal(HO, '2040'), 148); eq('bank 1020', await bal(HO, '1020'), 10000 - 914);
  return 'bank credited 914';
});
await check('pay: duplicate month rejected', () => tx(FM, `select process_payroll('${HO}', 2025, 1, '2025-01-28', '${BANK}', true)`), 'already processed');
await check('pay: without bank -> Approved, net accrued to 2050 salaries payable', async () => {
  await tx(SA, `select process_payroll('${HO}', 2025, 2, null, null, true)`);
  const run = await one(`select status, payment_date from payroll_runs where company_id='${HO}' and year=2025 and month=2`);
  if (run.status !== 'Approved') throw new Error(run.status);
  eq('2050', await bal(HO, '2050'), 914);
});
await check('pay: month with no eligible employees rejected', () =>
  tx(FM, `select process_payroll('${HO}', 2023, 1, null, '${BANK}', true)`), 'No eligible employees');
await check('pay: Management (view) cannot delete payslip lines', () =>
  as(MGMT, `delete from payroll_items`), 'permission denied');
await check('pay: processed run cannot be deleted directly', () =>
  as(FM, `delete from payroll_runs where company_id='${HO}' and year=2025 and month=1`), 'cannot be deleted');
await check('pay: client cannot insert a Paid run directly', () =>
  as(FM, `insert into payroll_runs (company_id, payroll_number, month, year, status) values ('${HO}','PR-X',5,2025,'Paid')`), 'process_payroll');
await check('pay: Viewer cannot read employees (civil id / IBAN)', async () => {
  const n = (await as(VIEW, `select count(*)::int n from employees`)).rows[0].n;
  if (n !== 0) throw new Error('n=' + n);
});
await check('pay: other office cannot read HO employees', async () => {
  const n = (await as(OTHER, `select count(*)::int n from employees where company_id='${HO}'`)).rows[0].n;
  if (n !== 0) throw new Error('n=' + n);
});
await check('ledger: trial balance of HO still balances (opening 10000/10000 + all runs)', async () => {
  const r = await one(`select sum(case when category in ('Asset','Expense') then balance else 0 end) dr,
                              sum(case when category in ('Asset','Expense') then 0 else balance end) cr
                       from v_account_balances where company_id='${HO}'`);
  eq('dr=cr', Number(r.dr) - Number(r.cr), 0);
  return `Dr ${r.dr} = Cr ${r.cr}`;
});
await check('anon cannot execute the RPCs', async () => {
  await db.exec('set role anon');
  try { await db.query(`select run_depreciation('${HO}', '2025-05-01', null, false)`); } finally { await db.exec('reset role'); }
}, 'permission denied');

let failed = 0;
for (const [s, n, d] of results) { if (s === 'FAIL') failed++; console.log(`${s.padEnd(5)}${n}${d ? ' — ' + String(d).slice(0, 160) : ''}`); }
console.log(`\naccounting/hr tests: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
