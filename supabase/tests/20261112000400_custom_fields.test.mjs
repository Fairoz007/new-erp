// Custom fields engine: migration 20261112000400_custom_fields.sql (+ the engine from 20261112000200)
// Standalone: node supabase/tests/20261112000400_custom_fields.test.mjs supabase/migrations
import { setup, seedFixtures, IDS } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, tx, as, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, FLEET, HO, DQ } = IDS;
const V = '55555555-5555-5555-5555-555555555555';
const val = async (sql) => { const r = await asServer(sql); const row = r.rows[0]; return row ? Object.values(row)[0] : undefined; };
const vt = (name) => `(select id from public.vehicle_types where name = '${name}')`;
const ins = (cf) => `insert into vehicles (company_id, vehicle_code, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission, custom_fields)
  values ('${HO}', null, 'P-' || substr(md5(random()::text), 1, 6), 'Bus', 'Operations', 'Toyota', 'Coaster', 'Diesel', 'Manual', '${JSON.stringify(cf)}')`;

await asServer(`
  insert into field_definitions (entity, key, label, field_type, options, required, show_in_list) values
    ('vehicle', 'route', 'Route', 'dropdown', '["North","South"]', false, true),
    ('vehicle', 'gps_id', 'GPS unit', 'text', '[]', false, false),
    ('vehicle', 'permit', 'Permit scan', 'file', '[]', false, false);
  insert into field_definitions (entity, key, label, field_type, required, vehicle_type_id)
    values ('vehicle', 'school_badge', 'School badge no.', 'text', true, ${vt('Bus')});
  insert into field_definitions (entity, key, label, field_type, required, office_id)
    values ('vehicle', 'dq_zone', 'Duqm zone', 'text', true, '${DQ}');
`);

// ---------------------------------------------------------------- validation
await check('required type-specific field enforced on insert by an app user', () =>
  tx(FLEET, ins({ route: 'North' })), 'Required field(s) missing: School badge no.');
await check('insert with the required field succeeds; numbers/booleans normalised', async () => {
  const r = (await as(FLEET, `${ins({ school_badge: 'SB-1', route: 'South' })} returning custom_fields`)).rows[0];
  assert(r.custom_fields.school_badge === 'SB-1' && r.custom_fields.route === 'South', JSON.stringify(r)); return 'ok';
});
await check('dropdown value outside the options is rejected', () =>
  tx(FLEET, ins({ school_badge: 'x', route: 'East' })), 'Route must be one of: North, South');
await check('unknown keys are rejected', () => tx(FLEET, ins({ school_badge: 'x', colour_code: 1 })), 'Unknown custom field "colour_code"');
await check('office-only required field does not apply in another office', () => tx(FLEET, ins({ school_badge: 'x' })));
await check('file value must be a storage reference of the same office', () =>
  tx(FLEET, ins({ school_badge: 'x', permit: `storage://documents/${DQ}/documents/a.pdf` })), 'must be a file uploaded for this office');
await check('file value pointing at a plain URL is rejected', () =>
  tx(FLEET, ins({ school_badge: 'x', permit: 'https://evil.example/a.pdf' })), 'must be a file uploaded for this office');
await check('file value in the same office is accepted', () =>
  tx(FLEET, ins({ school_badge: 'x', permit: `storage://documents/${HO}/documents/0b0b0b0b-0000-0000-0000-000000000000-permit.pdf` })));
await check('changing the vehicle type re-checks type-specific required fields', async () => {
  await asServer(`update vehicles set vehicle_type = 'Car' where id = '${V}'`);
  await asServer(`insert into field_definitions (entity, key, label, field_type, required, vehicle_type_id) values ('vehicle','taxi_no','Taxi permit','text', true, ${vt('Van')})`);
  return tx(FLEET, `update vehicles set vehicle_type = 'Van' where id = '${V}'`);
}, 'Required field(s) missing: Taxi permit');
await check('changing the type by name updates vehicle_type_id (was silently reverted)', async () => {
  await as(FLEET, `update vehicles set vehicle_type = 'Pickup' where id = '${V}'`);
  const r = (await asServer(`select v.vehicle_type, t.name from vehicles v join vehicle_types t on t.id = v.vehicle_type_id where v.id = '${V}'`)).rows[0];
  assert(r.vehicle_type === 'Pickup' && r.name === 'Pickup', JSON.stringify(r)); return 'Pickup';
});
await check('switching to an inactive type is rejected', async () => {
  await asServer(`update vehicle_types set active = false where name = 'Truck'`);
  return tx(FLEET, `update vehicles set vehicle_type = 'Truck' where id = '${V}'`);
}, 'inactive');
await check('editing other columns of an old record is not blocked by later required fields', () =>
  tx(FLEET, `update vehicles set notes = 'checked' where id = '${V}'`));
await check('hidden in an office: required field is not enforced there', async () => {
  await asServer(`insert into field_office_settings (field_id, office_id, visibility)
    select id, '${HO}', 'hidden' from field_definitions where key = 'school_badge'`);
  return tx(FLEET, ins({ route: 'North' }));
});
await check('per-office "required" makes an optional field mandatory', async () => {
  await asServer(`insert into field_office_settings (field_id, office_id, visibility)
    select id, '${HO}', 'required' from field_definitions where key = 'gps_id'`);
  return tx(FLEET, ins({ route: 'North' }));
}, 'Required field(s) missing: GPS unit');

// ---------------------------------------------------------------- definition guard
await asServer(`insert into vehicles (company_id, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission, custom_fields)
  values ('${HO}', 'USED-1', 'Car', 'Operations', 'Kia', 'Rio', 'Petrol', 'Automatic', '{"route":"North","gps_id":"G1"}')`);
await check('key of a field cannot change', () =>
  tx(ADMIN, `update field_definitions set key = 'route2' where key = 'route'`), 'key and record type of a field cannot change');
await check('type of a field holding data cannot change', () =>
  tx(ADMIN, `update field_definitions set field_type = 'text', options = '[]' where key = 'route'`), 'its type cannot change');
await check('dropdown option in use cannot be removed', () =>
  tx(ADMIN, `update field_definitions set options = '["South"]' where key = 'route'`), 'still used by records cannot be removed: North');
await check('adding a dropdown option is allowed', () =>
  tx(ADMIN, `update field_definitions set options = '["North","South","Interior"]' where key = 'route'`));
await check('a field holding data cannot be deleted', () =>
  tx(ADMIN, `delete from field_definitions where key = 'route'`), 'Deactivate it instead');
await check('deactivating a used field is allowed', () => tx(ADMIN, `update field_definitions set active = false where key = 'route'`));
await check('an unused field can be deleted and retyped', async () => {
  await asServer(`insert into field_definitions (entity, key, label, field_type) values ('client','tier','Tier','text')`);
  await as(ADMIN, `update field_definitions set field_type = 'number' where key = 'tier'`);
  await as(ADMIN, `delete from field_definitions where key = 'tier'`);
  return 'ok';
});
await check('custom_field_usage counts records holding a value', async () => {
  const n = (await as(ADMIN, `select custom_field_usage(id) n from field_definitions where key = 'gps_id'`)).rows[0].n;
  assert(n === 1, 'n=' + n); return 'n=1';
});
const NOSET = '00000000-0000-0000-0000-0000000000c9';
await asServer(`insert into roles (name, description) values ('No settings', 'test');
  insert into auth.users (id, email) values ('${NOSET}', 'noset@x.com');
  update profiles set role_id = (select id from roles where name = 'No settings') where id = '${NOSET}';
  insert into company_members (user_id, company_id) values ('${NOSET}', '${HO}')`);
await check('custom_field_usage needs settings:view', () =>
  tx(NOSET, `select custom_field_usage(id) from field_definitions where key = 'gps_id'`), 'Permission denied');
await check('field definitions are writable only with settings rights', () =>
  tx(FLEET, `insert into field_definitions (entity, key, label, field_type) values ('vehicle','x1','X','text')`), 'row-level security');
await check('server-side validation is reachable for every entity table', async () => {
  const r = await val(`select string_agg(event_object_table, ',' order by event_object_table) from information_schema.triggers
    where trigger_name like '%_zz_custom_fields' and event_manipulation = 'INSERT'`);
  assert(r === 'companies,customers,employees,expenses,suppliers,vehicles', r); return r;
});

t.report('custom fields tests');
