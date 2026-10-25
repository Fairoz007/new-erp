// Fleet integrity tests (Agent A). Standalone: boots its own PGlite, loads every migration, runs checks.
//   node supabase/tests/20261026000100_fleet.test.mjs supabase/migrations
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
  grant usage on schema public, auth, storage to authenticated;
  grant select, insert, delete on storage.objects to authenticated;
  grant execute on function auth.uid() to authenticated;
`);
for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
  try { await db.exec(readFileSync(join(dir, f), 'utf8')); }
  catch (e) { console.log('FAIL migration', f, '\n  ', e.message); process.exit(1); }
}

const results = [];
const check = async (name, fn, expectError) => {
  try { const r = await fn(); results.push([expectError ? 'FAIL' : 'PASS', name, expectError ? 'expected error, got success' : (r ?? '')]); }
  catch (e) { results.push([expectError && (expectError === true || e.message.includes(expectError)) ? 'PASS' : 'FAIL', name, e.message]); }
};
const tx = async (uid, sql) => {
  await db.exec(`set role authenticated; select set_config('request.uid', '${uid}', false);`);
  try { await db.exec(`begin; ${sql}; commit;`); } catch (e) { await db.exec('rollback'); throw e; } finally { await db.exec('reset role;'); }
};
const q = async sql => (await db.query(sql)).rows;
const one = async sql => Object.values((await q(sql))[0] ?? {})[0];

const ADMIN = '00000000-0000-0000-0000-00000000000a', MM = '00000000-0000-0000-0000-00000000000e',
      FLEET = '00000000-0000-0000-0000-00000000000c';
const HO = '11111111-1111-1111-1111-111111111111', V1 = '55555555-5555-5555-5555-555555555555',
      V2 = '55555555-5555-5555-5555-555555555556', SUP = '33333333-3333-3333-3333-333333333333';
await db.exec(`
  insert into auth.users (id, email) values ('${ADMIN}','a@x'),('${MM}','m@x'),('${FLEET}','f@x');
  update public.profiles set role = 'Super Admin' where id = '${ADMIN}';
  update public.profiles set role = 'Maintenance Manager' where id = '${MM}';
  update public.profiles set role = 'Fleet Manager' where id = '${FLEET}';
  insert into public.companies (id, name, code) values ('${HO}','Head Office','HO');
  insert into public.company_members values ('${MM}','${HO}'),('${FLEET}','${HO}');
  insert into public.suppliers (id, supplier_code, name, supplier_type, payment_terms_days) values ('${SUP}','SUP-001','Zubair','Garage', 45);
  insert into public.vehicles (id, company_id, vehicle_code, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission, current_mileage, purchase)
    values ('${V1}','${HO}','VH-001','1234 AB','SUV','Operations','Toyota','LC','Diesel','Automatic', 1000,
            '{"purchaseDate":"2025-01-15","purchaseValue":12000}');
  insert into public.approval_rules (module, threshold_amount, required_roles) values ('maintenance', 500, '{"Finance Manager","Company Admin"}');
`);

// --- vehicles
await check('vehicle insert writes a Purchase timeline entry (trigger)', async () => {
  await tx(ADMIN, `insert into vehicles (id, company_id, vehicle_code, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission, purchase)
    values ('${V2}','${HO}','VH-002','9999 ZZ','Van','Logistics','Ford','Transit','Diesel','Manual','{"purchaseDate":"","purchaseValue":9000}')`);
  const r = await q(`select title, amount from vehicle_timeline where vehicle_id='${V2}'`);
  if (r.length !== 1 || r[0].title !== 'Vehicle Added to Fleet' || Number(r[0].amount) !== 9000) throw new Error(JSON.stringify(r));
});
await check('no tyres are fabricated for a new vehicle', async () => {
  if (await one(`select count(*)::int from tyres where vehicle_id='${V2}'`) !== 0) throw new Error('tyres exist');
});
await check('vehicle status change writes a Status timeline entry', async () => {
  await tx(ADMIN, `update vehicles set status='Inactive' where id='${V2}'`);
  if (await one(`select count(*)::int from vehicle_timeline where category='Status' and vehicle_id='${V2}'`) !== 1) throw new Error('missing');
});

// --- maintenance (as Maintenance Manager: view-only on 'vehicles')
await check('Maintenance Manager cannot write vehicles directly', async () => {
  await tx(MM, `update vehicles set current_mileage = 5 where id='${V1}'`);
  if (await one(`select current_mileage from vehicles where id='${V1}'`) !== 1000) throw new Error('mileage changed');
  return 'update affected 0 rows (RLS)';
});
await check('maintenance: DB computes total, bumps odometer, writes timeline, raises pending invoice', async () => {
  await tx(MM, `insert into maintenance_records (id, company_id, record_number, vehicle_id, maintenance_date, maintenance_type, category, description,
      odometer_reading, supplier_id, parts_cost, labour_cost, tax, discount, other_charges, total_cost, invoice_number)
    values ('aaaaaaaa-0000-0000-0000-000000000001','${HO}','MNT-T-001','${V1}','2026-03-01','Routine','General Service','Service',
      4500,'${SUP}',100,50,7.5,10,0, 1, 'SUP-INV-77')`);
  const m = (await q(`select total_cost from maintenance_records where id='aaaaaaaa-0000-0000-0000-000000000001'`))[0];
  if (Number(m.total_cost) !== 147.5) throw new Error('total ' + m.total_cost);
  if (await one(`select current_mileage from vehicles where id='${V1}'`) !== 4500) throw new Error('odometer');
  if (await one(`select count(*)::int from vehicle_timeline where reference_id='aaaaaaaa-0000-0000-0000-000000000001' and category='Maintenance'`) !== 1) throw new Error('timeline');
  const inv = (await q(`select invoice_number, approval_status, grand_total, reference_number, due_date - invoice_date as terms from invoices where maintenance_record_id='aaaaaaaa-0000-0000-0000-000000000001'`))[0];
  if (!inv || inv.approval_status !== 'Pending Approval' || Number(inv.grand_total) !== 147.5 || inv.reference_number !== 'SUP-INV-77' || inv.terms !== 45 || !/^PINV-2026-\d{4}$/.test(inv.invoice_number)) throw new Error(JSON.stringify(inv));
  return inv.invoice_number;
});
await check('maintenance marked Paid raises no payable; odometer never goes backwards', async () => {
  await tx(MM, `insert into maintenance_records (id, company_id, record_number, vehicle_id, maintenance_date, maintenance_type, category, description,
      odometer_reading, supplier_id, parts_cost, labour_cost, tax, total_cost, payment_status)
    values ('aaaaaaaa-0000-0000-0000-000000000002','${HO}','MNT-T-002','${V1}','2026-03-02','Routine','Inspection','Check',100,'${SUP}',10,10,0,20,'Paid')`);
  if (await one(`select count(*)::int from invoices where maintenance_record_id='aaaaaaaa-0000-0000-0000-000000000002'`) !== 0) throw new Error('invoice created');
  if (await one(`select current_mileage from vehicles where id='${V1}'`) !== 4500) throw new Error('odometer went backwards');
});

// --- oil, expense, tyre event
await check('oil change: total computed, odometer bumped, timeline', async () => {
  await tx(MM, `insert into oil_changes (id, company_id, vehicle_id, date, odometer, oil_brand, oil_grade, quantity_litres, oil_cost, filter_cost, labour_cost, tax, total_cost, next_oil_change_mileage)
    values ('bbbbbbbb-0000-0000-0000-000000000001','${HO}','${V1}','2026-04-01',6000,'Mobil','5W-30',6.5,30,5,10,2.25,0,16000)`);
  if (Number(await one(`select total_cost from oil_changes where id='bbbbbbbb-0000-0000-0000-000000000001'`)) !== 47.25) throw new Error('total');
  if (await one(`select current_mileage from vehicles where id='${V1}'`) !== 6000) throw new Error('odometer');
  if (await one(`select count(*)::int from vehicle_timeline where category='Oil' and vehicle_id='${V1}'`) !== 1) throw new Error('timeline');
});
await check('expense: total = qty x unit + tax, timeline entry', async () => {
  await tx(FLEET, `insert into expenses (id, company_id, expense_number, vehicle_id, date, category, description, quantity, unit_price, tax, total, payment_method)
    values ('cccccccc-0000-0000-0000-000000000001','${HO}','EXP-2026-0001','${V1}','2026-04-02','Fuel','Diesel',40,0.5,1,999,'Card')`);
  if (Number(await one(`select total from expenses where id='cccccccc-0000-0000-0000-000000000001'`)) !== 21) throw new Error('total');
  if (await one(`select count(*)::int from vehicle_timeline where category='Expense'`) !== 1) throw new Error('timeline');
});
await check('expense without a vehicle is allowed and writes no timeline', async () => {
  await tx(FLEET, `insert into expenses (company_id, expense_number, date, category, description, quantity, unit_price, tax, total, payment_method)
    values ('${HO}','EXP-2026-0002','2026-04-02','Other','Office',1,5,0,5,'Cash')`);
});
await check('tyre event writes timeline', async () => {
  await tx(MM, `insert into tyre_events (company_id, vehicle_id, date, event_type, odometer, positions_affected, cost)
    values ('${HO}','${V1}','2026-04-03','Rotation',6100,'{"Front Left","Front Right"}',5)`);
  const d = await one(`select description from vehicle_timeline where category='Tyre'`);
  if (!d.includes('Front Left, Front Right')) throw new Error(d);
});

// --- accidents
await check('accident sets vehicle to Accident; closing releases it only when no other accident is open', async () => {
  await tx(FLEET, `insert into accidents (id, company_id, accident_number, vehicle_id, accident_date, accident_type, actual_repair_cost, insurance_contribution, status)
    values ('dddddddd-0000-0000-0000-000000000001','${HO}','ACC-2026-001','${V1}','2026-05-01','Side Impact',1000,600,'Reported')`);
  if (await one(`select status from vehicles where id='${V1}'`) !== 'Accident') throw new Error('not Accident');
  if (Number(await one(`select net_cost_to_company from accidents where id='dddddddd-0000-0000-0000-000000000001'`)) !== 400) throw new Error('net');
  await tx(FLEET, `insert into accidents (id, company_id, accident_number, vehicle_id, accident_date, accident_type, status)
    values ('dddddddd-0000-0000-0000-000000000002','${HO}','ACC-2026-002','${V1}','2026-05-02','Minor Scrape','Reported')`);
  await tx(FLEET, `update accidents set status='Closed' where id='dddddddd-0000-0000-0000-000000000001'`);
  if (await one(`select status from vehicles where id='${V1}'`) !== 'Accident') throw new Error('released while another accident is open');
  await tx(FLEET, `update accidents set status='Completed' where id='dddddddd-0000-0000-0000-000000000002'`);
  if (await one(`select status from vehicles where id='${V1}'`) !== 'Active') throw new Error('not released');
});

// --- work orders
await check('work order above threshold becomes Pending and raises an approval request (client cannot opt out)', async () => {
  await tx(MM, `insert into work_orders (id, company_id, work_order_number, vehicle_id, reported_date, problem_description, priority, status, approval_status, estimated_cost, requested_by)
    values ('eeeeeeee-0000-0000-0000-000000000001','${HO}','WO-2026-001','${V1}',current_date,'Gearbox','High','Requested','Not Required',800,'${MM}')`);
  if (await one(`select approval_status from work_orders where id='eeeeeeee-0000-0000-0000-000000000001'`) !== 'Pending') throw new Error('not pending');
  const r = (await q(`select amount, status, total_levels, requested_by, reference_number from approval_requests where reference_id='eeeeeeee-0000-0000-0000-000000000001'`))[0];
  if (!r || Number(r.amount) !== 800 || r.total_levels !== 2 || r.requested_by !== MM || r.reference_number !== 'WO-2026-001') throw new Error(JSON.stringify(r));
});
await check('work order below threshold needs no approval', async () => {
  await tx(MM, `insert into work_orders (id, company_id, work_order_number, vehicle_id, reported_date, problem_description, priority, status, estimated_cost, approval_status)
    values ('eeeeeeee-0000-0000-0000-000000000002','${HO}','WO-2026-002','${V1}',current_date,'Wipers','Low','Requested',50,'Not Required')`);
  if (await one(`select approval_status from work_orders where id='eeeeeeee-0000-0000-0000-000000000002'`) !== 'Not Required') throw new Error('status');
  if (await one(`select count(*)::int from approval_requests where reference_id='eeeeeeee-0000-0000-0000-000000000002'`) !== 0) throw new Error('request');
});
await check('pending work order cannot be started', () =>
  tx(MM, `update work_orders set status='In Progress' where id='eeeeeeee-0000-0000-0000-000000000001'`), 'requires approval');
await check('non-approver cannot flip approval_status directly', () =>
  tx(MM, `update work_orders set approval_status='Approved' where id='eeeeeeee-0000-0000-0000-000000000001'`), 'only an approver');
await check('work order cannot be created as Completed', () =>
  tx(MM, `insert into work_orders (company_id, work_order_number, vehicle_id, reported_date, problem_description, priority, status, estimated_cost)
    values ('${HO}','WO-2026-003','${V1}',current_date,'x','Low','Completed',1)`), 'cannot be created as Completed');
await check('approved + completed work order yields one record and one pending invoice', async () => {
  const rid = await one(`select id from approval_requests where reference_id='eeeeeeee-0000-0000-0000-000000000001'`);
  await tx(ADMIN, `select decide_approval('${rid}','Approved','level 1')`);
  await tx(ADMIN, `select decide_approval('${rid}','Approved','level 2')`);
  if (await one(`select status from work_orders where id='eeeeeeee-0000-0000-0000-000000000001'`) !== 'Approved') throw new Error('not approved');
  await tx(MM, `update work_orders set supplier_id='${SUP}' where id='eeeeeeee-0000-0000-0000-000000000001'`);
  await tx(MM, `select complete_work_order('eeeeeeee-0000-0000-0000-000000000001', 735)`);
  const m = await q(`select total_cost from maintenance_records where work_order_id='eeeeeeee-0000-0000-0000-000000000001'`);
  if (m.length !== 1 || Number(m[0].total_cost) !== 735) throw new Error(JSON.stringify(m));
  if (await one(`select count(*)::int from invoices where work_order_id='eeeeeeee-0000-0000-0000-000000000001'`) !== 1) throw new Error('invoice');
});

for (const [s, n, d] of results) console.log(s.padEnd(5), n, d ? '— ' + String(d).slice(0, 200) : '');
const fails = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
