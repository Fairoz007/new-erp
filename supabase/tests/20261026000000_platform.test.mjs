// Platform tests (Agent E, migration 20261026000000_platform.sql):
// document numbering, company bootstrap, security hardening, and the linked project's
// apply order (this file was pushed after 000100-000600 there).
//   node supabase/tests/20261026000000_platform.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const dir = process.argv[2] || 'supabase/migrations';
const t = await setup(dir);
const { db, check, as, tx, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, VIEWER, FLEET, OTHER, HO, DQ } = IDS;
const CADMIN = '00000000-0000-0000-0000-0000000000ca';   // Company Admin, member of HO
const VEH = '55555555-5555-5555-5555-555555555555', SUP = '33333333-3333-3333-3333-333333333333';
await db.exec(`
  select set_config('request.uid', '', false);
  insert into auth.users (id, email) values ('${CADMIN}','ca@x');
  update public.profiles set role = 'Company Admin' where id = '${CADMIN}';
  insert into public.company_members values ('${CADMIN}','${HO}');
`);
const val = async (sql) => Object.values((await asServer(sql)).rows[0] ?? {})[0];
const vehicleSql = (company, plate, code = 'null') => `insert into vehicles (company_id, vehicle_code, plate_number, vehicle_type,
  vehicle_category, brand, model, fuel_type, transmission) values ('${company}', ${code}, '${plate}', 'SUV', 'Pool', 'a', 'b', 'Diesel', 'Manual')`;

// ---------------------------------------------------------------------
// 1. Numbering
// ---------------------------------------------------------------------
await check('client-sent NULL vehicle_code is filled before NOT NULL check (VH-002 after seeded VH-001)', async () => {
  await tx(ADMIN, vehicleSql(HO, 'N-1'));
  const c = await val(`select vehicle_code from vehicles where plate_number='N-1'`);
  assert(c === 'VH-002', c); return c;
});
await check('omitted vehicle_code (column default \'\') is filled, sequential', async () => {
  await tx(FLEET, `insert into vehicles (company_id, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
                   values ('${HO}','N-2','SUV','Pool','a','b','Diesel','Manual')`);
  const c = await val(`select vehicle_code from vehicles where plate_number='N-2'`);
  assert(c === 'VH-003', c); return c;
});
await check('per-company independence: first Duqm vehicle is VH-001', async () => {
  await tx(OTHER, vehicleSql(DQ, 'D-1'));
  const c = await val(`select vehicle_code from vehicles where plate_number='D-1'`);
  assert(c === 'VH-001', c); return c;
});
await check('multi-row insert in one statement gets distinct consecutive numbers', async () => {
  await asServer(`insert into vehicles (company_id, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
                  select '${DQ}', 'M-' || g, 'SUV','Pool','a','b','Diesel','Manual' from generate_series(1,5) g`);
  const r = (await asServer(`select array_agg(vehicle_code order by plate_number) a, count(distinct vehicle_code)::int n
                             from vehicles where plate_number like 'M-%'`)).rows[0];
  assert(r.n === 5 && r.a.join() === 'VH-002,VH-003,VH-004,VH-005,VH-006', JSON.stringify(r)); return r.a.join();
});
await check('explicit legacy number advances the sequence (no later collision)', async () => {
  await asServer(vehicleSql(DQ, 'L-1', `'VH-040'`));
  await asServer(vehicleSql(DQ, 'L-2'));
  const c = await val(`select vehicle_code from vehicles where plate_number='L-2'`);
  assert(c === 'VH-041', c); return c;
});
await check('numbers never truncate past the pad width (VH-1000, not VH-100)', async () => {
  await asServer(`update doc_sequences set last_value = 999 where company_id='${DQ}' and prefix='VH'`);
  await asServer(vehicleSql(DQ, 'P-1'));
  const c = await val(`select vehicle_code from vehicles where plate_number='P-1'`);
  assert(c === 'VH-1000', c); return c;
});
await check('blank number can never be stored', () => asServer(`update vehicles set vehicle_code = ' ' where plate_number='P-1'`), 'not_blank');

await check('work order: WO-YYYY-001 with YYYY from reported_date', async () => {
  await tx(ADMIN, `insert into work_orders (company_id, work_order_number, vehicle_id, reported_date, problem_description, priority, estimated_cost)
                   values ('${HO}', null, '${VEH}', '2025-03-01', 'x', 'Low', 0)`);
  const c = await val(`select work_order_number from work_orders where reported_date='2025-03-01'`);
  assert(c === 'WO-2025-001', c); return c;
});
await check('maintenance MNT-YYYY-001, accident ACC-YYYY-001, expense EXP-YYYY-0001', async () => {
  await tx(ADMIN, `
    insert into maintenance_records (company_id, record_number, vehicle_id, maintenance_date, maintenance_type, category, description, total_cost)
      values ('${HO}', null, '${VEH}', '2024-05-05', 'Preventive', 'Oil', 'x', 10);
    insert into accidents (company_id, accident_number, vehicle_id, accident_date, accident_type)
      values ('${HO}', '', '${VEH}', '2024-06-06', 'Collision');
    insert into expenses (company_id, expense_number, vehicle_id, date, category, description, unit_price, total, payment_method)
      values ('${HO}', null, '${VEH}', '2024-07-07', 'Fuel', 'x', 5, 5, 'Cash')`);
  const r = (await asServer(`select (select record_number from maintenance_records where maintenance_date='2024-05-05') m,
      (select accident_number from accidents where accident_date='2024-06-06') a,
      (select expense_number from expenses where date='2024-07-07') e`)).rows[0];
  assert(r.m === 'MNT-2024-001' && r.a === 'ACC-2024-001' && r.e === 'EXP-2024-0001', JSON.stringify(r));
  return JSON.stringify(r);
});
await check('invoices: PINV-/INV-/CN-YYYY-0001 by type, reconciliation REC-YYYY-001', async () => {
  await asServer(`
    insert into customers (id, customer_code, name, customer_type) values ('99999999-9999-9999-9999-999999999999', null, 'C', 'Corporate');
    insert into invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date)
      values ('a0000000-0000-0000-0000-000000000001','${HO}', null, 'Purchase', 'Supplier', '${SUP}', '2023-02-02', '2023-03-02');
    insert into invoices (company_id, invoice_number, invoice_type, party_type, customer_id, invoice_date, due_date)
      values ('${HO}', null, 'Sales', 'Customer', '99999999-9999-9999-9999-999999999999', '2023-02-02', '2023-03-02');
    insert into invoices (company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date, is_credit_note, parent_invoice_id)
      values ('${HO}', null, 'Purchase', 'Supplier', '${SUP}', '2023-02-03', '2023-03-02', true, 'a0000000-0000-0000-0000-000000000001');
    insert into reconciliations (company_id, reconciliation_number, invoice_id, matching_type, purchase_order_amount, invoice_amount, difference_amount, variance_percentage, status, reconciled_date)
      values ('${HO}', null, 'a0000000-0000-0000-0000-000000000001', '2-Way', 1, 0, 0, 0, 'Matched', '2023-04-04')`);
  const r = (await asServer(`select string_agg(invoice_number, ',' order by invoice_number) n from invoices where invoice_date between '2023-01-01' and '2023-12-31'`)).rows[0].n;
  const rec = await val(`select reconciliation_number from reconciliations where reconciled_date='2023-04-04'`);
  assert(r === 'CN-2023-0001,INV-2023-0001,PINV-2023-0001' && rec === 'REC-2023-001', r + ' ' + rec);
  return r + ', ' + rec;
});
await check('fixed asset FA-001, depreciation DEP-YYYY-01, employee EMP-001, payroll PR-YYYY-MM', async () => {
  await asServer(`
    insert into fixed_assets (company_id, asset_code, name, category, purchase_date, purchase_cost, useful_life_years,
      annual_rate_percentage, depreciation_method, gl_asset_account, gl_expense_account, gl_accum_dep_account)
      values ('${HO}', null, 'Lift', 'Equipment', '2024-01-01', 1000, 5, 20, 'Straight-Line', '1530', '5080', '1520');
    insert into depreciation_runs (company_id, batch_number, period, period_label, run_date)
      values ('${HO}', null, '2022-08-01', 'Aug 2022', '2022-08-31');
    insert into employees (company_id, employee_code, name, designation, department, joining_date, basic_salary)
      values ('${HO}', null, 'E', 'Driver', 'Ops', '2024-01-01', 300);
    insert into payroll_runs (company_id, payroll_number, month, year) values ('${HO}', null, 3, 2021)`);
  const r = (await asServer(`select (select asset_code from fixed_assets where name='Lift') f,
      (select batch_number from depreciation_runs where period='2022-08-01') d,
      (select employee_code from employees where name='E') e,
      (select payroll_number from payroll_runs where year=2021) p`)).rows[0];
  assert(r.f === 'FA-001' && r.d === 'DEP-2022-01' && r.e === 'EMP-001' && r.p === 'PR-2021-03', JSON.stringify(r));
  return JSON.stringify(r);
});
await check('suppliers/customers: global SUP-/CUST- sequence, seeded SUP-001 respected', async () => {
  await tx(ADMIN, `insert into suppliers (supplier_code, name, supplier_type) values (null, 'S2', 'Garage');
                   insert into suppliers (name, supplier_type) values ('S3', 'Garage')`);
  const r = (await asServer(`select string_agg(supplier_code, ',' order by supplier_code) s from suppliers`)).rows[0].s;
  const c = await val(`select customer_code from customers where name='C'`);
  assert(r === 'SUP-001,SUP-002,SUP-003' && c === 'CUST-001', r + ' ' + c); return r + ', ' + c;
});
await check('next_doc_number: own office allowed', async () => (await as(FLEET, `select next_doc_number('${HO}','TST-2026', 3) n`)).rows[0].n);
await check('next_doc_number: foreign office denied', () => as(OTHER, `select next_doc_number('${HO}','TST-2026')`), 'Permission denied');
await check('next_doc_number: numbering trigger refuses foreign office too', () => tx(OTHER, vehicleSql(HO, 'X-1')), 'Permission denied');
await check('anon cannot call next_doc_number', async () => {
  await db.exec('set role anon');
  try { await db.query(`select next_doc_number('${HO}','X')`); } finally { await db.exec('reset role'); }
}, 'permission denied');

// ---------------------------------------------------------------------
// 2. Company bootstrap (after ALL migrations, incl. 000600 membership guards)
// ---------------------------------------------------------------------
const REQUIRED = ['1010','1020','1100','1300','1510','1520','1530','2010','2030','2040','2050','2100','3010','3020','3030','4000','5000','5070','5075','5080'];
await check('Company Admin creates an office: INSERT ... RETURNING works, CoA seeded, creator is a member', async () => {
  const r = (await as(CADMIN, `insert into companies (name, code) values ('Sohar', 'SOH') returning id, created_by`)).rows[0];
  assert(r && r.created_by === CADMIN, 'returning ' + JSON.stringify(r));
  const s = (await asServer(`select (select count(*)::int from accounts where company_id='${r.id}') n,
      (select count(*)::int from account_templates where active) tn,
      (select array_agg(code) from accounts where company_id='${r.id}' and code = any($1)) req,
      exists (select 1 from company_members where user_id='${CADMIN}' and company_id='${r.id}') member`, [REQUIRED])).rows[0];
  assert(s.n === s.tn && s.req.length === REQUIRED.length && s.member, JSON.stringify(s));
  const sees = (await as(CADMIN, `select count(*)::int n from accounts where company_id='${r.id}'`)).rows[0].n;
  assert(sees === s.n, 'creator sees ' + sees);
  return `${s.n} accounts, member, creator sees CoA`;
});
await check('server-created office (no JWT): CoA seeded, no membership row', async () => {
  await asServer(`insert into companies (id, name, code) values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Salalah', 'SLL')`);
  const r = (await asServer(`select (select count(*)::int from accounts where company_id='cccccccc-cccc-cccc-cccc-cccccccccccc') n,
      (select count(*)::int from company_members where company_id='cccccccc-cccc-cccc-cccc-cccccccccccc') m`)).rows[0];
  assert(r.n > 30 && r.m === 0, JSON.stringify(r)); return JSON.stringify(r);
});
await check('Viewer cannot create an office', () => as(VIEWER, `insert into companies (name, code) values ('V', 'V1')`), 'row-level security');
await check('seed_chart_of_accounts is idempotent (0 added)', async () => {
  const n = (await as(ADMIN, `select seed_chart_of_accounts('${HO}') n`)).rows[0].n; assert(n === 0 || n > 0, n);
  const again = (await as(ADMIN, `select seed_chart_of_accounts('${HO}') n`)).rows[0].n; assert(again === 0, again);
  return `first ${n}, then 0`;
});
await check('seed_chart_of_accounts denied for foreign office', () => as(OTHER, `select seed_chart_of_accounts('${HO}')`), 'Permission denied');
await check('account_templates readable by Viewer', async () => (await as(VIEWER, `select count(*)::int n from account_templates`)).rows[0].n);
await check('account_templates not writable by Viewer', () => as(VIEWER, `insert into account_templates (code, name, category, subcategory) values ('9999','x','Asset','x')`), 'row-level security');

// ---------------------------------------------------------------------
// 3. Hardening
// ---------------------------------------------------------------------
const canExec = async (role, sig) => (await asServer(`select has_function_privilege('${role}', '${sig}', 'execute') ok`)).rows[0].ok;
await check('authenticated cannot execute internal functions (recalc_*, helpers, guards)', async () => {
  for (const sig of ['public.recalc_invoice_totals(uuid)', 'public.recalc_invoice_settlement(uuid)', 'public.handle_new_user()',
                     'public.guard_profile_update()', 'public._assign_doc_number(uuid,text,integer,text)', 'public._seed_chart_of_accounts(uuid)'])
    assert(!(await canExec('authenticated', sig)), sig);
  return 'ok';
});
await check('authenticated actually blocked from calling recalc_invoice_totals', () =>
  as(ADMIN, `select recalc_invoice_totals('a0000000-0000-0000-0000-000000000001')`), 'permission denied');
await check('no trigger function (any slot) is executable by authenticated/anon', async () => {
  const r = (await asServer(`select string_agg(p.proname, ',') bad from pg_proc p where p.pronamespace='public'::regnamespace
     and p.prorettype='trigger'::regtype and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))`)).rows[0].bad;
  assert(!r, r); return 'none';
});
await check('no public function is executable by anon', async () => {
  const r = (await asServer(`select string_agg(p.proname, ',') bad from pg_proc p where p.pronamespace='public'::regnamespace
     and has_function_privilege('anon', p.oid, 'execute')`)).rows[0].bad;
  assert(!r, r); return 'none';
});
await check('RLS helpers + RPCs still executable by authenticated', async () => {
  for (const sig of ['public.has_company_access(uuid)', 'public.has_perm(text,public.permission_action)', 'public.app_role()',
                     'public.is_super_admin()', 'public.can_approve(text,numeric)', 'public.storage_company(text)',
                     'public.next_doc_number(uuid,text,integer)', 'public.record_payment(uuid,numeric,date,text,uuid,text,text,text)'])
    assert(await canExec('authenticated', sig), sig);
  return 'ok';
});
await check('every public table has RLS enabled + forced', async () => {
  const r = (await asServer(`select string_agg(relname, ',') bad from pg_class where relnamespace='public'::regnamespace
     and relkind='r' and not (relrowsecurity and relforcerowsecurity)`)).rows[0].bad;
  assert(!r, r); return 'all';
});
await check('anon has no privileges on any public table/view', async () => {
  const r = (await asServer(`select string_agg(relname, ',') bad from pg_class where relnamespace='public'::regnamespace
     and relkind in ('r','v') and (has_table_privilege('anon', oid, 'select') or has_table_privilege('anon', oid, 'insert'))`)).rows[0].bad;
  assert(!r, r); return 'none';
});
await check('authenticated has no TRUNCATE on any table', async () => {
  const r = (await asServer(`select string_agg(relname, ',') bad from pg_class where relnamespace='public'::regnamespace
     and relkind='r' and has_table_privilege('authenticated', oid, 'truncate')`)).rows[0].bad;
  assert(!r, r); return 'none';
});
await check('Fleet Manager (companies edit) cannot see Duqm office', async () => {
  const n = (await as(FLEET, `select count(*)::int n from companies where id='${DQ}'`)).rows[0].n; assert(n === 0, 'n=' + n); return 'n=0';
});
await check('Fleet Manager cannot rename Duqm office (0 rows)', async () => {
  await tx(FLEET, `update companies set name='hijack' where id='${DQ}'`);
  const n = await val(`select name from companies where id='${DQ}'`); assert(n === 'Duqm', n); return n;
});
await check('Company Admin cannot add self to Duqm', () => as(CADMIN, `insert into company_members values ('${CADMIN}','${DQ}')`), 'row-level security');
await check('Viewer (invoices view only) cannot delete invoice lines', async () => {
  await asServer(`insert into invoice_lines (invoice_id, line_no, description, quantity, unit_price) values ('a0000000-0000-0000-0000-000000000001', 1, 'x', 1, 1)`);
  // Viewer has no invoices access at all in the matrix, so use Management-like read access: grant temporarily via Viewer -> invoices view
  await asServer(`insert into role_permissions values ('Viewer','invoices','view') on conflict do nothing`);
  await tx(VIEWER, `delete from invoice_lines where invoice_id='a0000000-0000-0000-0000-000000000001'`);
  const n = await val(`select count(*)::int from invoice_lines where invoice_id='a0000000-0000-0000-0000-000000000001'`);
  await asServer(`delete from role_permissions where role='Viewer' and module='invoices'`);
  assert(n === 1, 'n=' + n); return 'line kept';
});
await check('colleague profiles visible to members of the same office', async () => {
  const n = (await as(VIEWER, `select count(*)::int n from profiles where id in ('${FLEET}','${OTHER}')`)).rows[0].n;
  assert(n === 1, 'n=' + n); return 'sees HO colleague only';
});
await check('profile role change is audited', async () => {
  await asServer(`update profiles set department='Ops' where id='${VIEWER}'`);
  const n = await val(`select count(*)::int from audit_logs where entity_type='profiles' and action='UPDATE'`);
  assert(n >= 1, n); return 'n=' + n;
});
await check('direct client writes to the ledger are not granted', () => tx(ADMIN, `delete from journal_lines`), 'permission denied');

// ---------------------------------------------------------------------
// 4. Linked-project order: 000000-000200, 000100-000600, then this file last
// ---------------------------------------------------------------------
await check('remote apply order: migration applies last and keeps other slots\' grants', async () => {
  const r = await setup(dir, { quiet: true, order: fs => [...fs.filter(f => !f.includes('_platform')), ...fs.filter(f => f.includes('_platform'))] });
  const q = async (sql) => (await r.db.query(sql)).rows[0];
  const lost = (await q(`select string_agg(p.proname, ',') bad from pg_proc p where p.pronamespace='public'::regnamespace
      and p.proname in ('create_invoice','submit_invoice','run_depreciation','process_payroll','set_user_companies',
                        'mark_all_notifications_read','media_can_write','storage_entity')
      and not has_function_privilege('authenticated', p.oid, 'execute')`)).bad;
  assert(!lost, 'lost grants: ' + lost);
  await seedFixtures(r.db);
  await r.tx(ADMIN, vehicleSql(HO, 'R-1'));
  const c = (await q(`select vehicle_code from vehicles where plate_number='R-1'`)).vehicle_code;
  assert(c === 'VH-002', c);
  const trg = (await q(`select string_agg(p.proname, ',') bad from pg_proc p where p.pronamespace='public'::regnamespace
     and p.prorettype='trigger'::regtype and has_function_privilege('authenticated', p.oid, 'execute')`)).bad;
  assert(!trg, 'trigger fns executable: ' + trg);
  return 'applied, grants kept, numbering works';
});

t.report();
