// Bus-first fleet: drivers, vehicle assignments, seat defaults, expiry alerts, v_fleet_expiries.
// Migration 20261112000600_fleet_bus.sql
// Standalone: node supabase/tests/20261112000600_fleet_bus.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, tx, as, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, VIEWER, FLEET, OTHER, HO, DQ } = IDS;
const VEH = '55555555-5555-5555-5555-555555555555';
const VEH2 = '55555555-5555-5555-5555-555555555556';
const VEH_DQ = '55555555-5555-5555-5555-555555555557';
const E1 = '66666666-6666-6666-6666-666666666661', E2 = '66666666-6666-6666-6666-666666666662', E_DQ = '66666666-6666-6666-6666-666666666663';
const val = async (sql) => { const r = await asServer(sql); const row = r.rows[0]; return row ? Object.values(row)[0] : undefined; };
const role = (name) => `(select id from public.roles where name = '${name}')`;

await asServer(`
  insert into organizations (legal_name, trade_name, base_currency) values ('Acme Transport LLC', 'Acme', 'OMR');
  insert into role_grants (role_id, module, action) select ${role('Fleet Manager')}, 'drivers', a::permission_action
    from unnest(array['view','create','edit']) a on conflict do nothing;
  delete from role_grants where role_id = ${role('Viewer')} and module = 'drivers';
  insert into employees (id, company_id, employee_code, name, designation, department, joining_date, basic_salary) values
    ('${E1}','${HO}','E-1','Salim','Driver','Ops',current_date,300),
    ('${E2}','${HO}','E-2','Khalid','Driver','Ops',current_date,300),
    ('${E_DQ}','${DQ}','E-3','Rashid','Driver','Ops',current_date,300);
  insert into vehicles (id, company_id, vehicle_code, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission) values
    ('${VEH2}','${HO}','VH-002','2222 AB','SUV','Operations','Toyota','LC','Diesel','Automatic'),
    ('${VEH_DQ}','${DQ}','VH-003','3333 AB','SUV','Operations','Toyota','LC','Diesel','Automatic');
`);

// ---------------------------------------------------------------- drivers
let D1, D2, D_DQ;
await check('fleet manager registers a driver; office and name come from the employee', async () => {
  const r = (await as(FLEET, `insert into drivers (company_id, employee_id, licence_number, licence_class, licence_expiry_date)
    values ('${DQ}', '${E1}', ' LIC-100 ', 'Heavy', current_date + 400) returning id, company_id, display_name, licence_number`)).rows[0];
  D1 = r.id;
  assert(r.company_id === HO && r.display_name === 'Salim' && r.licence_number === 'LIC-100', JSON.stringify(r)); return 'HO / Salim';
});
await check('licence numbers are unique (ignoring case and spaces)', () =>
  tx(FLEET, `insert into drivers (company_id, employee_id, licence_number, licence_expiry_date) values ('${HO}','${E2}','lic 100',current_date + 10)`),
  'already registered to Salim');
await check('cannot register a driver for an employee in another office', () =>
  tx(FLEET, `insert into drivers (company_id, employee_id, licence_number, licence_expiry_date) values ('${HO}','${E_DQ}','LIC-300',current_date + 10)`),
  'cannot add drivers');
await check('one driver record per employee', () =>
  tx(FLEET, `insert into drivers (company_id, employee_id, licence_number, licence_expiry_date) values ('${HO}','${E1}','LIC-101',current_date + 10)`),
  'duplicate key');
await check('a driver cannot be moved to another employee', async () => {
  D2 = (await as(FLEET, `insert into drivers (company_id, employee_id, licence_number, licence_expiry_date) values ('${HO}','${E2}','LIC-200',current_date - 1) returning id`)).rows[0].id;
  return tx(FLEET, `update drivers set employee_id = '${E1}' where id = '${D2}'`);
}, 'cannot be moved');
await check('viewer without drivers rights sees no drivers', async () => {
  const n = (await as(VIEWER, `select count(*)::int n from drivers`)).rows[0].n;
  assert(n === 0, n); return '0';
});
await check('other office cannot see HO drivers', async () => {
  D_DQ = (await as(ADMIN, `insert into drivers (company_id, employee_id, licence_number, licence_expiry_date) values ('${DQ}','${E_DQ}','LIC-300',current_date + 90) returning id`)).rows[0].id;
  await asServer(`insert into role_grants (role_id, module, action) select ${role('Fleet Manager')}, 'drivers', 'view' on conflict do nothing`);
  const r = (await as(OTHER, `select display_name from drivers`)).rows.map(x => x.display_name);
  assert(r.length === 1 && r[0] === 'Rashid', JSON.stringify(r)); return r.join(',');
});

// ---------------------------------------------------------------- assignments
await check('assign driver: vehicle shows the name, employee points at the vehicle', async () => {
  await as(FLEET, `update vehicles set driver_id = '${D1}' where id = '${VEH}'`);
  const r = (await asServer(`select v.assigned_driver a, e.assigned_vehicle_id e from vehicles v, employees e where v.id = '${VEH}' and e.id = '${E1}'`)).rows[0];
  assert(r.a === 'Salim' && r.e === VEH, JSON.stringify(r)); return r.a;
});
await check('a driver drives one vehicle at a time', () => tx(FLEET, `update vehicles set driver_id = '${D1}' where id = '${VEH2}'`), 'already assigned to 1234 AB');
await check('a driver with an expired licence cannot be assigned', () => tx(FLEET, `update vehicles set driver_id = '${D2}' where id = '${VEH2}'`), 'expired on');
await check('a driver from another office cannot be assigned', () => tx(ADMIN, `update vehicles set driver_id = '${D_DQ}' where id = '${VEH2}'`), 'belongs to another office');
await check('suspending a driver unassigns the vehicle', async () => {
  await as(FLEET, `update drivers set status = 'Suspended' where id = '${D1}'`);
  const r = (await asServer(`select v.driver_id d, v.assigned_driver a, e.assigned_vehicle_id e from vehicles v, employees e where v.id = '${VEH}' and e.id = '${E1}'`)).rows[0];
  assert(r.d === null && r.a === null && r.e === null, JSON.stringify(r));
  await as(FLEET, `update drivers set status = 'Active' where id = '${D1}'`);
  return 'cleared';
});
await check('renaming the employee renames the driver and the vehicle column', async () => {
  await as(FLEET, `update vehicles set driver_id = '${D1}' where id = '${VEH}'`);
  await asServer(`update employees set name = 'Salim Al Harthy' where id = '${E1}'`);
  const r = (await asServer(`select (select display_name from drivers where id = '${D1}') d, assigned_driver a from vehicles where id = '${VEH}'`)).rows[0];
  assert(r.d === 'Salim Al Harthy' && r.a === 'Salim Al Harthy', JSON.stringify(r)); return r.a;
});
await check('vehicle transfer leaves the old office driver behind', async () => {
  await as(ADMIN, `select transfer_to_office('vehicle', '${VEH}', '${DQ}', 'Route moved')`);
  const r = (await asServer(`select company_id c, driver_id d from vehicles where id = '${VEH}'`)).rows[0];
  assert(r.c === DQ && r.d === null, JSON.stringify(r));
  await as(ADMIN, `select transfer_to_office('vehicle', '${VEH}', '${HO}', 'Back')`);
  return 'cleared';
});
await check('employee transfer moves the driver record and drops the vehicle', async () => {
  await as(FLEET, `update vehicles set driver_id = '${D1}' where id = '${VEH}'`);
  await as(ADMIN, `select transfer_to_office('employee', '${E1}', '${DQ}', 'Relocated')`);
  const r = (await asServer(`select (select company_id from drivers where id = '${D1}') c, (select driver_id from vehicles where id = '${VEH}') d`)).rows[0];
  assert(r.c === DQ && r.d === null, JSON.stringify(r)); return 'moved';
});
await check('terminating an employee deactivates the driver', async () => {
  await asServer(`update employees set status = 'Terminated' where id = '${E_DQ}'`);
  const s = await val(`select status from drivers where id = '${D_DQ}'`);
  assert(s === 'Inactive', s); return s;
});

// ---------------------------------------------------------------- contract / route / inspection
let CON;
await check('vehicle can be put on an active client contract of its office', async () => {
  const cust = await val(`insert into customers (customer_code, name, customer_type, office_id, sharing) values (null,'School Board','Government','${HO}','organization') returning id`);
  CON = await val(`insert into contracts (company_id, party_type, customer_id, title, start_date, status) values ('${HO}','Customer','${cust}','School run',current_date,'Active') returning id`);
  await as(FLEET, `update vehicles set contract_id = '${CON}', route_name = 'Seeb - Mawaleh' where id = '${VEH2}'`);
  return (await val(`select route_name from vehicles where id = '${VEH2}'`));
});
await check('a contract of another office is rejected', () => tx(ADMIN, `update vehicles set contract_id = '${CON}' where id = '${VEH_DQ}'`), 'belongs to another office');
await check('a terminated contract cannot be newly assigned', async () => {
  await asServer(`update contracts set status = 'Terminated' where id = '${CON}'`);
  return tx(FLEET, `update vehicles set contract_id = null where id = '${VEH2}'; update vehicles set contract_id = '${CON}' where id = '${VEH2}'`);
}, 'is terminated');
await check('next inspection cannot be before the last one', () =>
  tx(FLEET, `update vehicles set last_inspection_date = current_date, next_inspection_date = current_date - 1 where id = '${VEH2}'`), 'vehicles_inspection_order');
await check('seats default from the vehicle type', async () => {
  const id = await val(`select id from vehicle_types where lower(name) = 'bus'`);
  const cap = await val(`select seat_capacity from vehicle_types where id = '${id}'`);
  const r = (await as(FLEET, `insert into vehicles (company_id, vehicle_code, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
    values ('${HO}','VH-010','1010 BB','Bus','Operations','Ashok','Falcon','Diesel','Manual') returning number_of_seats, vehicle_type_id`)).rows[0];
  assert(r.vehicle_type_id === id && r.number_of_seats === cap, JSON.stringify(r)); return String(cap);
});

// ---------------------------------------------------------------- alerts
await check('alerts: permit, inspection, licence, registration in the window; not repeated', async () => {
  await asServer(`update vehicles set permit_expiry_date = current_date + 5, next_inspection_date = current_date - 2, last_inspection_date = null,
                    registration_expiry_date = current_date + 400 where id = '${VEH2}';
                  update organizations set expiry_alert_days = 10;`);
  await asServer(`select refresh_expiry_notifications(null)`);
  const types = (await asServer(`select type, severity from notifications where reference_id in ('${VEH2}','${D2}') order by type`)).rows;
  const again = await val(`select refresh_expiry_notifications(null)`);
  const names = types.map(x => `${x.type}/${x.severity}`).join(',');
  assert(names === 'inspection_expiring/critical,licence_expiring/critical,permit_expiring/warning', names);
  assert(again === 0, `second run created ${again}`);
  return names;
});
await check('service due from the vehicle type interval', async () => {
  await asServer(`update vehicles set current_mileage = 20500, vehicle_type_id = (select id from vehicle_types where lower(name) = 'bus'), vehicle_type = 'Bus' where id = '${VEH2}';
                  update vehicle_types set service_interval_km = 10000 where lower(name) = 'bus';
                  insert into maintenance_records (company_id, record_number, vehicle_id, maintenance_date, maintenance_type, category, description, odometer_reading, total_cost)
                    values ('${HO}','MR-1','${VEH2}',current_date - 30,'Preventive','Service','Oil',10000,0);`);
  await asServer(`select refresh_expiry_notifications(null)`);
  const s = await val(`select severity from notifications where type = 'service_due' and vehicle_id = '${VEH2}'`);
  assert(s === 'critical', s); return s;
});
await check('alert window must be 1–365 days', () => tx(ADMIN, `update organizations set expiry_alert_days = 0`), 'expiry_alert_days');
await check('v_fleet_expiries follows office access', async () => {
  const ho = (await as(FLEET, `select distinct company_id from v_fleet_expiries`)).rows.map(r => r.company_id);
  assert(ho.length > 0 && ho.every(c => c === HO), JSON.stringify(ho));
  const kinds = (await as(FLEET, `select kind from v_fleet_expiries where vehicle_id = '${VEH2}' order by kind`)).rows.map(r => r.kind).join(',');
  assert(kinds === 'inspection,permit,registration', kinds); return kinds;
});
await check('app users cannot call refresh_expiry_notifications directly', () => tx(FLEET, `select refresh_expiry_notifications(null)`), 'permission denied');

t.report();
