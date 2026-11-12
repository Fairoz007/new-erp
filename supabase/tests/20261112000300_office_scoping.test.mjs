// Office scoping: party ownership & sharing, cross-office isolation, audited office transfers.
// Migration 20261112000300_office_scoping.sql
// Standalone: node supabase/tests/20261112000300_office_scoping.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, tx, as, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, OTHER, HO, DQ } = IDS;
const HOA = '00000000-0000-0000-0000-0000000000f1';   // Admin, member of HO only
const DQA = '00000000-0000-0000-0000-0000000000f2';   // Admin, member of DQ only
const BOTH = '00000000-0000-0000-0000-0000000000f3';  // Admin in HO and DQ
const HOV = '00000000-0000-0000-0000-0000000000f4';   // Viewer in HO, Admin in DQ
const MS = '00000000-0000-0000-0000-0000000000f5';    // third office
const val = async (sql) => { const r = await asServer(sql); const row = r.rows[0]; return row ? Object.values(row)[0] : undefined; };
const n = async (uid, sql) => Number(Object.values((await as(uid, sql)).rows[0])[0]);
const role = (name) => `(select id from public.roles where name = '${name}')`;
const C_HO = 'c0000000-0000-0000-0000-000000000001', C_ORG = 'c0000000-0000-0000-0000-000000000002', C_SEL = 'c0000000-0000-0000-0000-000000000003';
const S_HO = 'b0000000-0000-0000-0000-000000000001';
const V2 = 'a0000000-0000-0000-0000-000000000002', E1 = 'e0000000-0000-0000-0000-000000000001';

await asServer(`
  insert into companies (id, name, code) values ('${MS}','Muscat','MS');
  insert into auth.users (id, email) values ('${HOA}','hoa@x.com'), ('${DQA}','dqa@x.com'), ('${BOTH}','both@x.com'), ('${HOV}','hov@x.com');
  update profiles set role_id = ${role('Admin')} where id in ('${HOA}','${DQA}','${BOTH}','${HOV}');
  insert into company_members (user_id, company_id) values ('${HOA}','${HO}'), ('${DQA}','${DQ}'), ('${BOTH}','${HO}'), ('${BOTH}','${DQ}'), ('${HOV}','${DQ}');
  insert into company_members (user_id, company_id, role_id) values ('${HOV}','${HO}', ${role('Viewer')});
  insert into customers (id, customer_code, name, customer_type, office_id, sharing) values
    ('${C_HO}','CUST-901','HO only','Corporate','${HO}','office'),
    ('${C_ORG}','CUST-902','Everyone','Corporate','${HO}','organization'),
    ('${C_SEL}','CUST-903','HO + MS','Corporate','${HO}','selected');
  insert into party_office_shares (customer_id, company_id) values ('${C_SEL}','${MS}');
  insert into suppliers (id, supplier_code, name, supplier_type, office_id, sharing) values ('${S_HO}','SUP-901','HO garage','Garage','${HO}','office');
`);

// ---------------------------------------------------------------- schema
await check('customers/suppliers have office_id NOT NULL and a sharing check', async () => {
  const r = await val(`select string_agg(table_name || '.' || column_name || ':' || is_nullable, ',' order by table_name, column_name)
    from information_schema.columns where table_schema = 'public' and table_name in ('customers','suppliers') and column_name in ('office_id','sharing')`);
  assert(!r.includes(':YES'), r); return r;
});
await check('every table with company_id has RLS and (if readable) a select policy', async () => {
  const bad = await val(`select string_agg(c.table_name, ', ') from information_schema.columns c
    join pg_class k on k.relname = c.table_name and k.relnamespace = 'public'::regnamespace and k.relkind = 'r'
    where c.table_schema = 'public' and c.column_name = 'company_id'
      and (not k.relrowsecurity or (has_table_privilege('authenticated', k.oid, 'select')
           and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.table_name and p.cmd in ('SELECT','ALL'))))`);
  assert(!bad, 'missing RLS/select policy: ' + bad); return 'all covered';
});
await check('every company_id select policy is scoped (no "true" policies for authenticated)', async () => {
  const bad = await val(`select string_agg(distinct p.tablename, ', ') from pg_policies p
    join information_schema.columns c on c.table_schema = 'public' and c.table_name = p.tablename and c.column_name = 'company_id'
    where p.schemaname = 'public' and p.cmd in ('SELECT','ALL') and btrim(coalesce(p.qual,'')) in ('true','')`);
  assert(!bad, bad); return 'scoped';
});
await check('server-side insert with no office defaults to the first office, shared organization-wide', async () => {
  const r = (await asServer(`insert into suppliers (supplier_code, name, supplier_type) values ('SUP-950','Server','Garage') returning office_id, sharing`)).rows[0];
  const first = await val(`select id from companies order by created_at, name limit 1`);
  assert(r.office_id === first && r.sharing === 'organization', JSON.stringify(r)); return JSON.stringify(r);
});
await check('app user with one office: office defaults to it', async () => {
  const r = (await as(DQA, `insert into suppliers (supplier_code, name, supplier_type) values ('SUP-951','DQ shop','Garage') returning office_id, sharing`)).rows[0];
  assert(r.office_id === DQ && r.sharing === 'office', JSON.stringify(r)); return 'DQ';
});
await check('app user with several offices must choose one', () =>
  tx(BOTH, `insert into suppliers (supplier_code, name, supplier_type) values ('SUP-952','x','Garage')`), 'Choose the office this supplier belongs to');
await check('cannot create a client in an office where you lack customers:create', () =>
  tx(HOV, `insert into customers (customer_code, name, customer_type, office_id) values ('CUST-960','x','Corporate','${HO}')`), 'row-level security');

// ---------------------------------------------------------------- visibility
const seen = async (uid) => (await as(uid, `select string_agg(name, ',' order by name) v from customers where id in ('${C_HO}','${C_ORG}','${C_SEL}')`)).rows[0].v ?? '';
await check('HO user sees all three HO clients', async () => { const v = await seen(HOA); assert(v === 'Everyone,HO + MS,HO only', v); return v; });
await check('DQ user sees only the organization-wide client', async () => { const v = await seen(DQA); assert(v === 'Everyone', v); return v; });
await check('DQ user cannot read the HO-only supplier', async () => {
  const k = await n(DQA, `select count(*) from suppliers where id = '${S_HO}'`); assert(k === 0, 'n=' + k); return 'hidden';
});
await check('DQ user cannot update an organization-wide client owned by HO', async () => {
  const r = await as(DQA, `update customers set notes = 'hack' where id = '${C_ORG}' returning id`);
  assert(r.rows.length === 0, 'updated'); return 'no rows';
});
await check('party_office_ids reflects the sharing mode', async () => {
  const r = (await asServer(`select party_office_ids('Customer','${C_SEL}') s, party_office_ids('Customer','${C_ORG}') o, party_office_ids('Customer','${C_HO}') h`)).rows[0];
  assert(r.s.length === 2 && r.s.includes(MS) && r.o.length === 3 && r.h.length === 1, JSON.stringify(r)); return 'ok';
});

// ---------------------------------------------------------------- party usable only where shared
const inv = (co, cust, no) => `insert into invoices (company_id, invoice_number, invoice_type, party_type, customer_id, invoice_date, due_date)
  values ('${co}','${no}','Sales','Customer','${cust}',current_date,current_date)`;
await check('HO-only client cannot be invoiced from DQ', () => tx(BOTH, inv(DQ, C_HO, 'S-DQ-1')), 'This client is not shared with this office');
await check('organization-wide client can be invoiced from DQ', () => tx(BOTH, inv(DQ, C_ORG, 'S-DQ-2')));
await check('HO-only supplier cannot be used on a DQ expense', () =>
  tx(BOTH, `insert into expenses (company_id, date, category, description, unit_price, total, payment_method, supplier_id)
            values ('${DQ}', current_date, 'Fuel', 'diesel', 1, 1, 'Cash', '${S_HO}')`), 'This supplier is not shared with this office');

// ---------------------------------------------------------------- set_party_sharing
await check('DQ admin cannot change sharing of an HO client', () =>
  tx(DQA, `select set_party_sharing('Customer','${C_HO}','organization')`), 'Permission denied');
await check('sharing cannot be changed by a plain UPDATE', () =>
  tx(HOA, `update customers set sharing = 'organization' where id = '${C_HO}'`), 'set_party_sharing');
await check('"selected" needs at least one office', () =>
  tx(HOA, `select set_party_sharing('Customer','${C_HO}','selected', '{}')`), 'at least one office');
await check('HO admin shares the HO client with DQ; DQ now sees and can invoice it', async () => {
  await as(HOA, `select set_party_sharing('Customer','${C_HO}','selected', array['${DQ}']::uuid[])`);
  const v = await seen(DQA); assert(v.includes('HO only'), v);
  await tx(BOTH, inv(DQ, C_HO, 'S-DQ-3'));
  return v;
});
await check('back to office-only removes the share rows', async () => {
  await as(HOA, `select set_party_sharing('Customer','${C_HO}','office')`);
  const k = await val(`select count(*)::int from party_office_shares where customer_id = '${C_HO}'`);
  assert(k === 0, 'n=' + k); assert(!(await seen(DQA)).includes('HO only'), 'still visible'); return 'ok';
});
await check('share rows cannot be written directly', () =>
  tx(HOA, `insert into party_office_shares (customer_id, company_id) values ('${C_HO}','${DQ}')`), 'permission denied');
await check('sharing changes are audited', async () => {
  const k = await val(`select count(*)::int from audit_logs where entity_type = 'party_office_shares'`);
  assert(k > 0, 'none'); return 'n=' + k;
});

// ---------------------------------------------------------------- direct moves blocked
await check('direct vehicle company_id change is blocked', () =>
  tx(BOTH, `update vehicles set company_id = '${DQ}' where id = '55555555-5555-5555-5555-555555555555'`), 'Transfer to office');
await check('direct supplier office_id change is blocked', () =>
  tx(BOTH, `update suppliers set office_id = '${DQ}' where id = '${S_HO}'`), 'Transfer to office');

// ---------------------------------------------------------------- transfer_to_office
await asServer(`
  insert into vehicles (id, company_id, vehicle_code, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
    values ('${V2}','${HO}','VH-002','777 BUS','Bus','Operations','Toyota','Coaster','Diesel','Manual');
  insert into tyres (company_id, vehicle_id, brand, position, status) values ('${HO}','${V2}','Bridgestone','Front Left','Good'), ('${HO}','${V2}','Old','Spare','Scrapped');
  insert into employees (id, company_id, employee_code, name, designation, department, joining_date, basic_salary, assigned_vehicle_id)
    values ('${E1}','${HO}','EMP-901','Driver One','Driver','Operations', current_date, 500, '${V2}');
  select ensure_system_account('${HO}','1510','Motor Vehicles Fleet at Cost','Asset','Fixed Assets');
  select ensure_system_account('${HO}','1520','Accumulated Depreciation - Motor Vehicles','Asset','Fixed Assets');
  insert into fixed_assets (company_id, asset_code, name, category, vehicle_id, purchase_date, purchase_cost, useful_life_years,
      annual_rate_percentage, depreciation_method, accumulated_depreciation, gl_asset_account, gl_expense_account, gl_accum_dep_account)
    values ('${HO}','FA-901','Coaster 777','Vehicles','${V2}', current_date - 400, 30000, 5, 20, 'Straight-Line', 6000, '1510','6100','1520');
  insert into work_orders (company_id, work_order_number, vehicle_id, reported_date, problem_description, priority, status)
    values ('${HO}','WO-901','${V2}', current_date, 'brakes', 'High', 'Requested');
`);
const xfer = (uid, ent, id, to, reason = 'Relocated') => as(uid, `select transfer_to_office('${ent}','${id}','${to}', ${reason === null ? 'null' : `'${reason}'`}) id`);
await check('transfer needs a reason', () => tx(BOTH, `select transfer_to_office('vehicle','${V2}','${DQ}', '  ')`), 'reason is required');
await check('transfer needs create rights in the destination office', () =>
  tx(HOA, `select transfer_to_office('vehicle','${V2}','${DQ}','x')`), 'Permission denied');
await check('vehicle with an open work order cannot move', () =>
  tx(BOTH, `select transfer_to_office('vehicle','${V2}','${DQ}','x')`), 'open work order');
await check('vehicle transfer moves tyres + fixed asset, clears driver, posts balanced JEs through 1600', async () => {
  await asServer(`update work_orders set status = 'Cancelled' where work_order_number = 'WO-901'`);
  await xfer(BOTH, 'vehicle', V2, DQ);
  const r = (await asServer(`select
      (select company_id from vehicles where id = '${V2}') v,
      (select count(*)::int from tyres where vehicle_id = '${V2}' and company_id = '${DQ}') tyres_dq,
      (select count(*)::int from tyres where vehicle_id = '${V2}' and company_id = '${HO}') tyres_ho,
      (select assigned_vehicle_id from employees where id = '${E1}') drv,
      (select company_id from fixed_assets where asset_code = 'FA-901') fa,
      (select details from office_transfers where record_id = '${V2}') d`)).rows[0];
  assert(r.v === DQ && r.tyres_dq === 1 && r.tyres_ho === 1 && r.drv === null && r.fa === DQ, JSON.stringify(r));
  assert(r.d.tyres_moved === 1 && r.d.driver_assignments_cleared === 1 && Number(r.d.book_value) === 24000, JSON.stringify(r.d));
  const j = (await asServer(`select e.company_id, sum(l.debit) dr, sum(l.credit) cr,
      sum(case when l.account_code = '1600' then l.debit - l.credit else 0 end) io
    from journal_entries e join journal_lines l on l.entry_id = e.id
    where e.source_module = 'Transfer' group by e.company_id order by e.company_id`)).rows;
  assert(j.length === 2, 'jes ' + j.length);
  for (const x of j) assert(Number(x.dr) === Number(x.cr), 'unbalanced ' + JSON.stringify(x));
  const io = j.reduce((s, x) => s + Number(x.io), 0);
  assert(io === 0, 'inter-office does not net to zero: ' + io);
  return JSON.stringify(j.map(x => Number(x.io)));
});
await check('vehicle timeline records the transfer', async () => {
  const k = await val(`select count(*)::int from vehicle_timeline where vehicle_id = '${V2}' and category = 'Transfer'`);
  assert(k === 1, 'n=' + k); return 'ok';
});
await check('transferring to the current office is rejected', () =>
  tx(BOTH, `select transfer_to_office('vehicle','${V2}','${DQ}','x')`), 'already in this office');
await check('employee transfer', async () => {
  await xfer(BOTH, 'employee', E1, DQ, 'Joined Duqm depot');
  const c = await val(`select company_id from employees where id = '${E1}'`); assert(c === DQ, c); return 'DQ';
});
await check('client transfer moves home office and drops a now-redundant share', async () => {
  await asServer(`insert into party_office_shares (customer_id, company_id) values ('${C_SEL}','${DQ}')`);
  await xfer(BOTH, 'client', C_SEL, DQ);
  const r = (await asServer(`select office_id, (select count(*)::int from party_office_shares where customer_id = '${C_SEL}' and company_id = '${DQ}') s from customers where id = '${C_SEL}'`)).rows[0];
  assert(r.office_id === DQ && r.s === 0, JSON.stringify(r)); return 'ok';
});
await check('office_transfers: visible to members of either office, hidden from others', async () => {
  const a = await n(DQA, `select count(*) from office_transfers`);
  const b = await n(HOA, `select count(*) from office_transfers`);
  await asServer(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f6','ms@x.com');
    update profiles set role_id = ${role('Admin')} where id = '00000000-0000-0000-0000-0000000000f6';
    insert into company_members (user_id, company_id) values ('00000000-0000-0000-0000-0000000000f6','${MS}')`);
  const c = await n('00000000-0000-0000-0000-0000000000f6', `select count(*) from office_transfers`);
  assert(a === 3 && b === 3 && c === 0, `${a}/${b}/${c}`); return `${a}/${b}/${c}`;
});
await check('office_transfers cannot be written directly', () =>
  tx(ADMIN, `insert into office_transfers (entity, record_id, from_company_id, to_company_id, reason) values ('vehicle','${V2}','${HO}','${DQ}','x')`), 'permission denied');
await check('transfers are audited', async () => {
  const k = await val(`select count(*)::int from audit_logs where entity_type = 'office_transfers'`);
  assert(k === 3, 'n=' + k); return 'n=3';
});
await check('Fleet Manager of DQ cannot pull a HO vehicle', () =>
  tx(OTHER, `select transfer_to_office('vehicle','55555555-5555-5555-5555-555555555555','${DQ}','x')`), 'Permission denied');

t.report('office scoping tests');
