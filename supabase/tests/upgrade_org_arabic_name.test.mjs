// Upgrade stage 3: organizations.legal_name_ar (Arabic legal name, optional, at most 200 characters).
import { setup, seedFixtures, IDS } from './harness.mjs';
const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { check, as, asServer, assert } = t;
await seedFixtures(t.db);
await asServer(`insert into public.organizations (legal_name) select 'Org' where not exists (select 1 from public.organizations)`);

await check('legal_name_ar exists and is optional', async () => {
  const r = (await asServer(`select is_nullable from information_schema.columns where table_name = 'organizations' and column_name = 'legal_name_ar'`)).rows;
  assert(r.length === 1 && r[0].is_nullable === 'YES', JSON.stringify(r)); return 'nullable text';
});
await check('a Super Admin saves the Arabic name and reads it back', async () => {
  await as(IDS.ADMIN, `update public.organizations set legal_name_ar = 'الحكيم الوطنية ش.م.م.' where true`);
  const n = (await as(IDS.VIEWER, `select legal_name_ar from public.organizations`)).rows[0]?.legal_name_ar;
  assert(n === 'الحكيم الوطنية ش.م.م.', String(n)); return n;
});
await check('more than 200 characters is refused', async () => {
  await asServer(`update public.organizations set legal_name_ar = repeat('ح', 201) where true`);
}, 'organizations_legal_name_ar_len');
t.report();
