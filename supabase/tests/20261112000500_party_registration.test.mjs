// Client/supplier registration: approval, duplicates, opening balances, contracts and rate cards.
// Migration 20261112000500_party_registration.sql
// Standalone: node supabase/tests/20261112000500_party_registration.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
// These checks cover the numbering mechanics with the formats as first installed (no office code);
// office_numbers.test.mjs covers the office code that 20261113007000 turns on.
await t.db.exec(`update public.document_formats set include_office_code = false;`);
const { db, check, tx, as, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, FLEET, OTHER, HO, DQ } = IDS;
const CLERK = '00000000-0000-0000-0000-0000000000d1';   // can create clients in HO, cannot approve
const FM = '00000000-0000-0000-0000-0000000000d2';      // Finance Manager in HO (approve)
const FM2 = '00000000-0000-0000-0000-0000000000d3';     // Finance Manager in HO
const val = async (sql) => { const r = await asServer(sql); const row = r.rows[0]; return row ? Object.values(row)[0] : undefined; };
const role = (name) => `(select id from public.roles where name = '${name}')`;

await asServer(`
  insert into roles (name, description) values ('Clerk', 'test');
  insert into role_grants (role_id, module, action) select ${role('Clerk')}, m, a::permission_action
    from (values ('customers','view'),('customers','create'),('customers','edit'),('suppliers','view'),('suppliers','create'),
                 ('invoices','view'),('invoices','create'),('contracts','view')) v(m, a);
  insert into auth.users (id, email) values ('${CLERK}','clerk@x.com'), ('${FM}','fm@x.com'), ('${FM2}','fm2@x.com');
  update profiles set role_id = ${role('Clerk')} where id = '${CLERK}';
  update profiles set role_id = ${role('Finance Manager')} where id in ('${FM}','${FM2}');
  insert into company_members (user_id, company_id) values ('${CLERK}','${HO}'), ('${FM}','${HO}'), ('${FM2}','${HO}');
  insert into organizations (legal_name, trade_name, base_currency) values ('Acme Transport LLC', 'Acme', 'OMR');
  update organizations set party_approval_required = true;
`);
const newClient = (uid, name, extra = '') => as(uid, `insert into customers (customer_code, name, customer_type, office_id${extra ? ', ' + extra.split('=')[0] : ''})
  values (null, '${name}', 'Corporate', '${HO}'${extra ? ', ' + extra.split('=').slice(1).join('=') : ''}) returning id, registration_status, submitted_by`);

// ---------------------------------------------------------------- approval
let pendingId;
await check('clerk without approve rights: new client starts Pending', async () => {
  const r = (await newClient(CLERK, 'Pending Co')).rows[0];
  pendingId = r.id;
  assert(r.registration_status === 'Pending' && r.submitted_by === CLERK, JSON.stringify(r)); return 'Pending';
});
await check('Finance Manager (approve rights): new client is Approved at once', async () => {
  const r = (await newClient(FM, 'Direct Co')).rows[0];
  assert(r.registration_status === 'Approved', JSON.stringify(r)); return 'Approved';
});
await check('pending client cannot be invoiced', () =>
  tx(FM, `insert into invoices (company_id, invoice_number, invoice_type, party_type, customer_id, invoice_date, due_date)
          values ('${HO}','S-P1','Sales','Customer','${pendingId}',current_date,current_date)`), 'registration is pending');
await check('status cannot be set with a plain UPDATE', () =>
  tx(FM, `update customers set registration_status = 'Approved' where id = '${pendingId}'`), 'Use Approve / Reject');
await check('clerk cannot approve', () => tx(CLERK, `select review_party('Customer','${pendingId}','Approved')`), 'Permission denied');
await check('rejecting needs a reason', () => tx(FM, `select review_party('Customer','${pendingId}','Rejected', ' ')`), 'reason is required');
await check('submitter cannot approve their own registration', async () => {
  const r = (await newClient(FM2, 'x', '')).rows[0];      // FM2 has approve → auto Approved; simulate own pending:
  await asServer(`update customers set registration_status = 'Pending', submitted_by = '${FM2}' where id = '${r.id}'`);
  return tx(FM2, `select review_party('Customer','${r.id}','Approved')`);
}, 'registration you submitted');
await check('Finance Manager rejects with a reason; submitter is notified', async () => {
  await as(FM, `select review_party('Customer','${pendingId}','Rejected','Missing CR copy')`);
  const r = (await asServer(`select registration_status s, review_note n, reviewed_by b,
    (select count(*)::int from notifications where user_id = '${CLERK}' and type = 'party_review') k from customers where id = '${pendingId}'`)).rows[0];
  assert(r.s === 'Rejected' && r.n === 'Missing CR copy' && r.b === FM && r.k === 1, JSON.stringify(r)); return 'Rejected';
});
await check('a corrected rejected registration goes back to Pending', async () => {
  await as(CLERK, `update customers set cr_number = 'CR-777' where id = '${pendingId}'`);
  const s = await val(`select registration_status from customers where id = '${pendingId}'`);
  assert(s === 'Pending', s); return s;
});
await check('approve; the client can now be invoiced', async () => {
  await as(FM, `select review_party('Customer','${pendingId}','Approved')`);
  await tx(FM, `insert into invoices (company_id, invoice_number, invoice_type, party_type, customer_id, invoice_date, due_date)
                values ('${HO}','S-P2','Sales','Customer','${pendingId}',current_date,current_date)`);
  return 'ok';
});
await check('only pending registrations can be reviewed', () =>
  tx(FM, `select review_party('Customer','${pendingId}','Rejected','late')`), 'Only pending registrations');
await check('approval not required: clerk creates Approved clients', async () => {
  await asServer(`update organizations set party_approval_required = false`);
  const r = (await newClient(CLERK, 'Free Co')).rows[0];
  await asServer(`update organizations set party_approval_required = true`);
  assert(r.registration_status === 'Approved', r.registration_status); return 'Approved';
});

// ---------------------------------------------------------------- duplicates
await asServer(`update customers set vat_number = 'OM 1100-22', email = 'Buyer@Acme.com' where name = 'Direct Co'`);
await check('duplicate VAT (spaces/dashes/case ignored) is blocked', () =>
  tx(FM, `insert into customers (customer_code, name, customer_type, office_id, vat_number) values (null,'Dup','Corporate','${HO}','om110022')`),
  'VAT number om110022 is already registered (CUST-');
await check('duplicate email (case-insensitive) is blocked', () =>
  tx(FM, `insert into customers (customer_code, name, customer_type, office_id, email) values (null,'Dup','Corporate','${HO}',' buyer@acme.COM ')`),
  'email buyer@acme.COM is already registered');
await check('duplicate CR is blocked on update too', () =>
  tx(FM, `update customers set cr_number = 'cr 777' where name = 'Direct Co'`), 'CR number cr 777 is already registered');
await check('the same VAT may exist once as client and once as supplier', () =>
  tx(FM, `insert into suppliers (supplier_code, name, supplier_type, office_id, vat_number) values (null,'Acme supply','Garage','${HO}','OM110022')`));
await check('a rejected registration does not block a new one', async () => {
  const r = (await newClient(CLERK, 'Rej VAT', "vat_number='OM-999'")).rows[0];
  await as(FM, `select review_party('Customer','${r.id}','Rejected','duplicate')`);
  return tx(FM, `insert into customers (customer_code, name, customer_type, office_id, vat_number) values (null,'Real VAT','Corporate','${HO}','OM999')`);
});
await check('party_duplicates lists legacy duplicates', async () => {
  await asServer(`alter table customers disable trigger customers_zy_duplicates;
    insert into customers (customer_code, name, customer_type, office_id, email) values (null,'Legacy A','Corporate','${HO}','old@x.com'), (null,'Legacy B','Corporate','${HO}','OLD@x.com');
    alter table customers enable trigger customers_zy_duplicates;`);
  const r = (await as(FM, `select * from party_duplicates('Customer') where field = 'Email'`)).rows;
  assert(r.length === 1 && r[0].codes.length === 2, JSON.stringify(r)); return r[0].value;
});

// ---------------------------------------------------------------- opening balances
await check('app users cannot type an opening balance', () =>
  tx(FM, `insert into customers (customer_code, name, customer_type, office_id, opening_balance) values (null,'OB','Corporate','${HO}', 50)`), 'Post opening balance');
await check('...or change it later', () =>
  tx(FM, `update customers set opening_balance = 10 where name = 'Direct Co'`), 'Post opening balance');
await check('legacy memo balance is not double counted once an opening invoice exists', async () => {
  const id = await val(`select id from customers where name = 'Direct Co'`);
  await asServer(`update customers set opening_balance = 100 where id = '${id}'`);
  const before = Number(await val(`select current_balance from v_party_summary where party_id = '${id}'`));
  await asServer(`select ensure_system_account('${HO}','3900','Opening Balance Equity','Equity','Equity')`);
  await as(ADMIN, `select post_opening_party_balance('${HO}','Customer','${id}', 100, current_date)`);
  const after = Number(await val(`select current_balance from v_party_summary where party_id = '${id}'`));
  assert(before === 100 && after === 100, `${before} -> ${after}`); return `${before} -> ${after}`;
});

// ---------------------------------------------------------------- contracts and rate cards
const clientId = await val(`select id from customers where name = 'Direct Co'`);
let conId;
await check('contract gets a CON- number and the office currency', async () => {
  const r = (await as(ADMIN, `insert into contracts (company_id, party_type, customer_id, title, start_date, end_date, status)
    values ('${HO}','Customer','${clientId}','School transport 2027', current_date - 10, current_date + 355, 'Active') returning id, contract_number, currency`)).rows[0];
  conId = r.id;
  assert(/^CON-\d{4}-\d{3}$/.test(r.contract_number) && /^[A-Z]{3}$/.test(r.currency), JSON.stringify(r)); return r.contract_number;
});
await check('contract for a client not shared with the office is blocked', async () => {
  const id = await val(`select id from customers where name = 'Pending Co'`);
  return tx(ADMIN, `insert into contracts (company_id, party_type, customer_id, title, start_date) values ('${DQ}','Customer','${id}','x', current_date)`);
}, 'not shared with this office');
await check('party fields must match the party type', () =>
  tx(ADMIN, `insert into contracts (company_id, party_type, customer_id, title, start_date) values ('${HO}','Supplier','${clientId}','x', current_date)`), 'contracts_check');
await check('end date before start date is rejected', () =>
  tx(ADMIN, `insert into contracts (company_id, party_type, customer_id, title, start_date, end_date) values ('${HO}','Customer','${clientId}','x', current_date, current_date - 1)`), 'contracts_check');
await check('contract_rate: vehicle-type rate beats the generic one; default fee schedule is the fallback', async () => {
  await asServer(`
    insert into contract_rates (contract_id, description, rate, sort_order) values ('${conId}','Any vehicle per trip', 20, 1);
    insert into contract_rates (contract_id, description, vehicle_type_id, rate) values ('${conId}','Bus per trip', (select id from vehicle_types where name = 'Bus'), 35);
    insert into fee_schedules (name, currency, is_default, active) values ('Standard', 'OMR', true, true);
    insert into fee_items (schedule_id, code, name, rate) values ((select id from fee_schedules where name = 'Standard'), 'TRIP', 'Standard trip', 15);`);
  const bus = (await as(ADMIN, `select * from contract_rate('${HO}','${clientId}', current_date, (select id from vehicle_types where name = 'Bus'))`)).rows[0];
  const car = (await as(ADMIN, `select * from contract_rate('${HO}','${clientId}', current_date, (select id from vehicle_types where name = 'Car'))`)).rows[0];
  const other = (await as(ADMIN, `select * from contract_rate('${HO}','${pendingId}', current_date)`)).rows[0];
  assert(Number(bus.rate) === 35 && Number(car.rate) === 20 && other.source === 'fee_schedule' && Number(other.rate) === 15,
    JSON.stringify([bus, car, other]));
  return '35 / 20 / 15';
});
await check('expired contract no longer applies', async () => {
  const r = (await as(ADMIN, `select * from contract_rate('${HO}','${clientId}', current_date + 400)`)).rows[0];
  assert(r.source === 'fee_schedule', JSON.stringify(r)); return r.source;
});
await check('contracts are office-scoped (DQ user sees none of HO)', async () => {
  const k = Number((await as(OTHER, `select count(*) n from contracts`)).rows[0].n);
  assert(k === 0, 'n=' + k); return 'n=0';
});
await check('clerk (contracts view only) cannot add rate lines', () =>
  tx(CLERK, `insert into contract_rates (contract_id, description, rate) values ('${conId}','x', 1)`), 'row-level security');
await check('only draft contracts can be deleted', async () => {
  const r = await as(ADMIN, `delete from contracts where id = '${conId}' returning id`);
  assert(r.rows.length === 0, 'deleted an active contract'); return 'kept';
});
await check('contract number and office cannot change', () =>
  tx(ADMIN, `update contracts set company_id = '${DQ}' where id = '${conId}'`), 'cannot move to another office');
await check('contracts are audited', async () => {
  const k = await val(`select count(*)::int from audit_logs where entity_type = 'contracts'`); assert(k >= 1, 'none'); return 'n=' + k;
});
await check('Fleet Manager without contract rights cannot read contracts', async () => {
  const k = Number((await as(FLEET, `select count(*) n from contracts`)).rows[0].n);
  const has = await val(`select count(*)::int from role_grants where role_id = ${role('Fleet Manager')} and module = 'contracts' and action = 'view'`);
  assert(has > 0 || k === 0, 'n=' + k); return has > 0 ? 'has grant' : 'n=0';
});

t.report('party registration tests');
