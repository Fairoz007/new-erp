// A save made of two requests with the same request key: the expense insert, then submit_expense,
// which posts the expense journal. Migration 20261113009000_request_key_per_table.sql.
import { setup, seedFixtures, IDS } from './harness.mjs';
const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { db, check, tx, asServer, assert } = t;
await seedFixtures(db);
const { ADMIN, HO } = IDS;
const VEH = '55555555-5555-5555-5555-555555555555';
const KEY = '0b8e6c1e-2222-4a5b-9c3d-000000000001';
const EXP = 'eeeeeeee-0000-0000-0000-000000000001';
const withKey = (sql) => `select set_config('request.headers', '{"x-request-key":"${KEY}"}', true); ${sql}`;
const insert = `insert into expenses (id, company_id, vehicle_id, date, category, description, quantity, unit_price, tax, total, payment_method)
  values ('${EXP}', '${HO}', '${VEH}', current_date, 'Fuel', 'Diesel', 60, 0.236, 0, 0, 'Cash')`;

await check('request 1: the expense is saved with the key', async () => {
  await tx(ADMIN, withKey(insert)); return 'draft';
});
await check('request 2, same key: submitting it posts the journal (was refused as a duplicate)', async () => {
  await tx(ADMIN, withKey(`select submit_expense('${EXP}')`));
  const r = (await asServer(`select e.status, (select count(*)::int from journal_entries j where j.source_id = e.id) j from expenses e where e.id = '${EXP}'`)).rows[0];
  assert(r.j === 1, JSON.stringify(r)); return `${r.status}, 1 journal`;
});
await check('the same save sent again is still refused at the expense, nothing duplicated', async () => {
  try { await tx(ADMIN, withKey(insert.replace(EXP, 'eeeeeeee-0000-0000-0000-000000000002'))); }
  catch (e) {
    assert(e.code === 'PT409' && /already saved/.test(e.message), e.message);
    const n = (await asServer(`select count(*)::int n from expenses`)).rows[0].n; assert(n === 1, n); return 'refused; 1 expense';
  }
  throw new Error('duplicate expense accepted');
});
t.report();
