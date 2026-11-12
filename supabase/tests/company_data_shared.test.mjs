// The ERP holds one company's data. Records belong to an office (company_id), never to the user
// who created them: every user with access to that office sees the same rows, and a record stays
// when the user who entered it leaves.
import { setup, seedFixtures, IDS } from './harness.mjs';
const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { check, as, tx, asServer, assert } = t;
const { ADMIN, VIEWER, FLEET, OTHER, HO } = IDS;
await seedFixtures(t.db);

const V2 = '66666666-6666-6666-6666-666666666666';
await check('a Fleet Manager adds a vehicle to Head Office', async () => {
  await tx(FLEET, `insert into public.vehicles (id, company_id, vehicle_code, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
    values ('${V2}', '${HO}', 'VH-002', '5678 CD', 'SUV', 'Operations', 'Nissan', 'Patrol', 'Diesel', 'Automatic')`);
});
const plates = async uid => (await as(uid, `select plate_number from public.vehicles order by plate_number`)).rows.map(r => r.plate_number).join(',');
await check('another Head Office user sees exactly the same vehicles', async () => {
  const f = await plates(FLEET), v = await plates(VIEWER);
  assert(f === v && f.includes('5678 CD'), `fleet=${f} viewer=${v}`); return v;
});
await check('the Super Admin sees them too', async () => {
  const a = await plates(ADMIN); assert(a.includes('5678 CD'), a); return a;
});
await check('a user of another office does not see Head Office vehicles', async () => {
  const o = await plates(OTHER); assert(!o.includes('5678 CD'), o); return o || 'none';
});
await check('the record stays visible after the user who entered it is deactivated', async () => {
  await asServer(`update public.profiles set status = 'inactive' where id = '${FLEET}'`);
  const v = await plates(VIEWER); assert(v.includes('5678 CD'), v);
  const f = await plates(FLEET); assert(!f, `deactivated user still reads: ${f}`);
  return 'kept; the deactivated user reads nothing';
});
await check('no business table is filtered by the user who created a row', async () => {
  const r = (await asServer(`select tablename, policyname, qual from pg_policies where schemaname = 'public'
    and (qual ~ 'created_by\\s*=\\s*\\(?\\s*(select\\s+)?auth\\.uid' or with_check ~ 'created_by\\s*=\\s*\\(?\\s*(select\\s+)?auth\\.uid')
    and tablename not in ('companies')`)).rows;
  assert(r.length === 0, r.map(x => `${x.tablename}.${x.policyname}`).join(', ')); return 'none';
});
t.report();
