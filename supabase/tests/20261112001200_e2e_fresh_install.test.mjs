// Phase 11: fresh install end to end on a clean database (every migration, no fixtures).
// Organization → two offices (chart of accounts seeded) → banks → complete_setup → bus, client,
// supplier, employee, monthly expense, invoice, payment → the trial balance balances and each office's
// P&L is right → role and cross-office checks. No migration of its own.
// Standalone: node supabase/tests/20261112001200_e2e_fresh_install.test.mjs supabase/migrations
import { setup } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { check, tx, as, asServer, assert } = t;
const SA = '00000000-0000-0000-0000-0000000000a1', FMA = '00000000-0000-0000-0000-0000000000a2',
      FLB = '00000000-0000-0000-0000-0000000000a3', VWA = '00000000-0000-0000-0000-0000000000a4', SPA = '00000000-0000-0000-0000-0000000000a5';
const MCT = '11111111-aaaa-0000-0000-000000000001', SOH = '11111111-aaaa-0000-0000-000000000002';
const val = async (sql) => { const r = await asServer(sql); const row = r.rows[0]; return row ? Object.values(row)[0] : undefined; };
const role = (name) => `(select id from public.roles where name = '${name}')`;
const today = new Date().toISOString().slice(0, 10);
const j = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;

await check('a clean install has default roles, templates and no business data', async () => {
  const r = (await asServer(`select (select count(*) from roles where is_system)::int roles, (select count(*) from account_templates)::int tpl,
    (select count(*) from vehicle_types)::int vt, (select count(*) from companies)::int co, (select count(*) from vehicles)::int veh,
    (select count(*) from journal_entries)::int je`)).rows[0];
  assert(r.roles >= 5 && r.tpl > 20 && r.vt > 0 && r.co === 0 && r.veh === 0 && r.je === 0, JSON.stringify(r)); return JSON.stringify(r);
});
await asServer(`insert into auth.users (id, email) values ('${SA}','sa@x'), ('${FMA}','fm@x'), ('${FLB}','fl@x'), ('${VWA}','vw@x'), ('${SPA}','sp@x');
  update profiles set role_id = ${role('Super Admin')} where id = '${SA}';
  update profiles set role_id = ${role('Finance Manager')} where id = '${FMA}';
  update profiles set role_id = ${role('Fleet Manager')} where id = '${FLB}';
  update profiles set role_id = ${role('Viewer')} where id in ('${VWA}','${SPA}');`);

await check('wizard: the Super Admin creates the organization and two offices; each gets a chart of accounts', async () => {
  await tx(SA, `insert into organizations (legal_name, trade_name, base_currency, fy_start_month) values ('Gulf Express LLC', 'GES', 'OMR', 1)`);
  await tx(SA, `insert into companies (id, name, code) values ('${MCT}', 'Muscat', 'MCT'), ('${SOH}', 'Sohar', 'SOH')`);
  const r = (await asServer(`select c.code, c.currency, (select count(*) from accounts a where a.company_id = c.id)::int n from companies c order by c.code`)).rows;
  assert(r.length === 2 && r.every(x => x.n > 20 && x.currency === 'OMR'), JSON.stringify(r)); return JSON.stringify(r);
});
await asServer(`insert into company_members (user_id, company_id) values ('${FMA}','${MCT}'), ('${FLB}','${SOH}'), ('${VWA}','${MCT}');
  insert into company_members (user_id, company_id, role_id) values ('${SPA}','${MCT}', ${role('Sponsor')});`);

let BANK;
await check('wizard: bank accounts per office, then complete_setup', async () => {
  BANK = (await as(SA, `insert into bank_accounts (company_id, bank_name, account_name, account_number, account_type, gl_account_code, opening_balance, opening_date)
    values ('${MCT}', 'Bank Muscat', 'Ops', 'M-1', 'Current', '1020', 1000, '${today.slice(0, 4)}-01-01') returning id`)).rows[0].id;
  await tx(SA, `insert into bank_accounts (company_id, bank_name, account_name, account_number, account_type, gl_account_code)
    values ('${SOH}', 'Bank Dhofar', 'Ops', 'S-1', 'Current', '1020')`);
  await tx(SA, `insert into tax_rates (name, rate, is_default) values ('VAT 5%', 5, true); insert into payment_terms (name, days, is_default) values ('Net 30', 30, true)`);
  await tx(SA, `select complete_setup()`);
  return await val(`select setup_status from organizations`);
});

let BUS, CUS, SUP, EMP, EXP, INV;
await check('a bus, a client, a supplier and an employee are added in Muscat', async () => {
  BUS = (await as(SA, `insert into vehicles (company_id, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
    values ('${MCT}', '7788 MB', 'Bus', 'Operations', 'Ashok Leyland', 'Falcon', 'Diesel', 'Manual') returning id`)).rows[0].id;
  CUS = (await as(FMA, `insert into customers (customer_code, name, customer_type, office_id) values (null, 'Ministry of Education', 'Government', '${MCT}') returning id`)).rows[0].id;
  SUP = (await as(FMA, `insert into suppliers (supplier_code, name, supplier_type, office_id) values (null, 'Al Noor Garage', 'Garage', '${MCT}') returning id`)).rows[0].id;
  EMP = (await as(SA, `insert into employees (company_id, employee_code, name, designation, department, joining_date, basic_salary)
    values ('${MCT}', 'MCT-001', 'Khalid', 'Driver', 'Operations', '${today.slice(0, 4)}-01-01', 350) returning id`)).rows[0].id;
  return 'added';
});
await check('a monthly expense template creates this month\'s draft, which is submitted and posted', async () => {
  await as(SA, `insert into recurring_expenses (company_id, category_id, description, amount, tax, day_of_month, start_date, supplier_id)
    values ('${MCT}', (select id from expense_categories where name = 'Rent'), 'Depot rent', 200, 0, 1, '${today.slice(0, 8)}01', '${SUP}')`);
  await as(SA, `select generate_recurring_expenses('${today}')`);
  EXP = await val(`select id from expenses where company_id = '${MCT}' and description like 'Depot rent (%' and status = 'Draft'`);
  assert(EXP, 'no draft'); const s = (await as(FMA, `select submit_expense('${EXP}') s`)).rows[0].s;
  assert(s === 'Approved', s); return s;
});
await check('a sales invoice for the client is created and posted, and part-paid into the bank', async () => {
  INV = (await as(FMA, `select create_invoice(${j({ company_id: MCT, invoice_type: 'Sales', customer_id: CUS, invoice_date: today })},
    ${j([{ description: 'School bus contract', quantity: 1, unit_price: 1000, tax_rate_percentage: 5, gl_account_code: '4040', vehicle_id: BUS }])}, true) id`)).rows[0].id;
  const st = await val(`select approval_status from invoices where id = '${INV}'`);
  if (st !== 'Approved') await as(SA, `select decide_approval((select id from approval_requests where reference_id = '${INV}'), 'Approved', 'ok')`);
  await as(FMA, `select record_payment('${INV}', 600, '${today}', 'Bank Transfer', '${BANK}')`);
  const r = (await asServer(`select grand_total, outstanding_amount, payment_status from invoices where id = '${INV}'`)).rows[0];
  assert(Number(r.grand_total) === 1050 && Number(r.outstanding_amount) === 450, JSON.stringify(r)); return JSON.stringify(r);
});
await check('the trial balance balances in each office', async () => {
  const r = (await asServer(`select c.code, coalesce(sum(l.debit), 0) dr, coalesce(sum(l.credit), 0) cr from companies c
    left join journal_lines l on l.company_id = c.id group by c.code order by c.code`)).rows;
  assert(r.every(x => Number(x.dr) === Number(x.cr)), JSON.stringify(r)); return JSON.stringify(r);
});
await check('the Muscat P&L is revenue 1000 less rent 200; Sohar is empty', async () => {
  const pl = async (co) => (await asServer(`select
      coalesce(sum(case when a.category = 'Revenue' then l.credit - l.debit end), 0) rev,
      coalesce(sum(case when a.category = 'Expense' then l.debit - l.credit end), 0) exp
    from journal_lines l join journal_entries e on e.id = l.entry_id and e.status = 'Posted'
    join accounts a on a.company_id = l.company_id and a.code = l.account_code where l.company_id = '${co}'`)).rows[0];
  const m = await pl(MCT), s = await pl(SOH);
  assert(Number(m.rev) === 1000 && Number(m.exp) === 200 && Number(s.rev) === 0 && Number(s.exp) === 0, JSON.stringify({ m, s }));
  return `MCT net ${Number(m.rev) - Number(m.exp)}`;
});
await check('bank balance = opening 1000 + receipt 600', async () => {
  const b = await val(`select coalesce(sum(debit - credit), 0) from journal_lines where company_id = '${MCT}' and account_code = '1020'`);
  assert(Number(b) === 1600, b); return String(b);
});

// ---------------------------------------------------------------- roles and offices
await check('the Sohar fleet manager sees no Muscat vehicle, invoice, employee or journal', async () => {
  const r = (await as(FLB, `select (select count(*) from vehicles)::int v, (select count(*) from invoices)::int i,
    (select count(*) from employees)::int e, (select count(*) from journal_entries)::int j`)).rows[0];
  assert(r.v === 0 && r.i === 0 && r.e === 0 && r.j === 0, JSON.stringify(r)); return 'isolated';
});
await check('the Sohar fleet manager cannot add a vehicle to Muscat', () =>
  tx(FLB, `insert into vehicles (company_id, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
    values ('${MCT}', '1 X', 'Bus', 'Operations', 'X', 'Y', 'Diesel', 'Manual')`), 'no access to this office');
await check('the Muscat viewer reads but cannot write', async () => {
  const n = (await as(VWA, `select count(*)::int n from vehicles`)).rows[0].n;
  assert(n === 1, n);
  return tx(VWA, `update vehicles set brand = 'hacked' where id = '${BUS}'`).then(async () => {
    const b = await val(`select brand from vehicles where id = '${BUS}'`); assert(b !== 'hacked', b); return 'read-only';
  });
});
await check('the viewer cannot record a payment', () => tx(VWA, `select record_payment('${INV}', 10, '${today}', 'Cash', '${BANK}')`), 'ermission');
await check('the Muscat sponsor sees statement totals but no journal lines', async () => {
  const a = (await as(SPA, `select count(*)::int n from statement_accounts() where company_id = '${MCT}'`)).rows[0].n;
  const l = (await as(SPA, `select count(*)::int n from journal_lines`)).rows[0].n;
  assert(a > 0 && l === 0, JSON.stringify({ a, l })); return 'totals only';
});
await check('the finance manager cannot see the Sohar office books', async () => {
  const n = (await as(FMA, `select count(*)::int n from accounts where company_id = '${SOH}'`)).rows[0].n;
  assert(n === 0, n); return 'isolated';
});

t.report();
