// Upgrade stage 5: the Offices home screen reads its figures from vehicles, work_orders,
// v_fleet_expiries, invoice_summary(by_office), bank_accounts and expense_totals(office). A user
// never gets a figure of an office they cannot open, and does get the figures of their own office.
import { setup, seedFixtures, IDS } from './harness.mjs';
const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { check, as, tx, asServer, assert } = t;
await seedFixtures(t.db);
const { ADMIN, FLEET, HO, DQ } = IDS;
const SUP = '33333333-3333-3333-3333-333333333333';
const CUS = '99999999-9999-9999-9999-999999999992';
const VEH = '55555555-5555-5555-5555-555555555555';
const ACC_DQ = '00000000-0000-0000-0000-0000000000f1';   // Finance Manager, member of DQ only
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return ymd(d); };
const TODAY = day(0);
const rows = async (uid, sql) => (await as(uid, sql)).rows;

await asServer(`insert into auth.users (id, email) values ('${ACC_DQ}','acc-dq@x.com');
  update profiles set role_id = (select id from roles where name = 'Finance Manager') where id = '${ACC_DQ}';
  insert into company_members (user_id, company_id) values ('${ACC_DQ}','${DQ}');
  insert into customers (id, customer_code, name, customer_type) values ('${CUS}','CUST-OF1','Sample Customer','Corporate');
  insert into accounts (company_id, code, name, category, subcategory) values
    ('${DQ}','1010','Bank','Asset','Cash'), ('${DQ}','1100','AR','Asset','Receivables'), ('${DQ}','2100','Output VAT','Liability','Tax'),
    ('${DQ}','4010','Revenue','Revenue','Operating'), ('${HO}','4010','Revenue','Revenue','Operating') on conflict (company_id, code) do nothing;
  insert into bank_accounts (company_id, bank_name, account_name, account_number, account_type) values ('${DQ}','BM','DQ Ops','002','Current');
  update vehicles set registration_expiry_date = '${day(5)}' where id = '${VEH}';
  insert into work_orders (company_id, work_order_number, vehicle_id, problem_description, priority, status, reported_date) values ('${HO}','','${VEH}','Brakes','Low','In Progress','${TODAY}');`);

let seq = 0;
const sale = async (company, price) => {
  const id = `77777777-7777-7777-7777-${String(++seq).padStart(12, '0')}`;
  await tx(ADMIN, `insert into invoices (id, company_id, invoice_number, invoice_type, party_type, customer_id, invoice_date, due_date)
      values ('${id}','${company}','OF-${seq}','Sales','Customer','${CUS}','${TODAY}','${day(30)}');
    insert into invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
      values ('${id}', 1, 'Sample line', 1, ${price}, 5, '4010')`);
  await tx(ADMIN, `select post_invoice('${id}')`);
};
await sale(HO, 1000);
await sale(DQ, 200);
const expId = (await as(FLEET, `insert into expenses (company_id, vehicle_id, date, category, description, quantity, unit_price, tax, total, payment_method)
  values ('${HO}','${VEH}','${TODAY}','Fuel','Sample fuel',1,45.5,0,45.5,'Cash') returning id`)).rows[0].id;
await tx(ADMIN, `select submit_expense('${expId}')`);

await check('the Super Admin sees HO figures (the fixture is visible at all)', async () => {
  const s = (await rows(ADMIN, `select invoice_summary(null, '${TODAY}') s`))[0].s;
  const ho = s.by_office.find(b => b.company_id === HO);
  assert(ho && Number(ho.ar_open) === 1050, JSON.stringify(s.by_office));
  const e = await rows(ADMIN, `select company_id, total from expense_totals('{}'::jsonb, 'office')`);
  assert(e.some(r => r.company_id === HO && Number(r.total) === 45.5), JSON.stringify(e));
  return 'HO receivables 1050.000, expenses 45.500';
});
await check('a DQ-only user gets no HO receivables (invoice_summary by_office)', async () => {
  const s = (await rows(ACC_DQ, `select invoice_summary(null, '${TODAY}') s`))[0].s;
  assert(!s.by_office.some(b => b.company_id === HO), JSON.stringify(s.by_office));
  const dq = s.by_office.find(b => b.company_id === DQ);
  assert(dq && Number(dq.ar_open) === 210, 'own office: ' + JSON.stringify(s.by_office));
  return 'only DQ (210.000)';
});
await check('a DQ-only user gets no HO expenses (expense_totals by office)', async () => {
  const e = await rows(ACC_DQ, `select company_id, total from expense_totals('{}'::jsonb, 'office')`);
  assert(!e.some(r => r.company_id === HO), JSON.stringify(e)); return `${e.length} row(s)`;
});
await check('a DQ-only user gets no HO expiries, vehicles, work orders or bank accounts', async () => {
  const x = await rows(ACC_DQ, `select
      (select count(*) from v_fleet_expiries where company_id = '${HO}') ex,
      (select count(*) from vehicles where company_id = '${HO}') ve,
      (select count(*) from work_orders where company_id = '${HO}') wo,
      (select count(*) from bank_accounts where company_id = '${HO}') ba,
      (select count(*) from bank_accounts where company_id = '${DQ}') own`);
  const r = x[0];
  assert(Number(r.ex) + Number(r.ve) + Number(r.wo) + Number(r.ba) === 0, JSON.stringify(r));
  assert(Number(r.own) === 1, 'own bank account ' + r.own);
  return 'none from HO; own bank account visible';
});
await check('asking invoice_summary for HO by id gives nothing to a DQ-only user', async () => {
  const s = (await rows(ACC_DQ, `select invoice_summary('${HO}', '${TODAY}') s`))[0].s;
  assert(!s.by_office.length && Number(s.ar_outstanding ?? 0) === 0, JSON.stringify(s).slice(0, 200)); return 'empty';
});
t.report();
