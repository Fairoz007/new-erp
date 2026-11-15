// Upgrade stage 8: image manager. The shared upload writes to media/<office>/logos|vehicles/... and
// documents/<office>/<entity>/..., the organization logo to media/organization/...; the viewer reads
// through signed URLs. These checks pin the storage rules it depends on, against the final schema:
// nobody writes, reads or deletes inside another office's folders, and a replaced logo can be removed
// by the users allowed to change it.
import { setup, seedFixtures, IDS } from './harness.mjs';
const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { check, as, asServer, assert } = t;
await seedFixtures(t.db);
const { ADMIN, VIEWER, FLEET, OTHER, HO, DQ } = IDS;   // FLEET: Fleet Manager of HO; OTHER: Fleet Manager of DQ
await asServer(`grant usage on schema storage to authenticated; grant select, insert, delete on storage.objects to authenticated`);

const put = async (uid, bucket, name) => {
  try { await as(uid, `insert into storage.objects (bucket_id, name) values ('${bucket}', '${name}')`); return true; }
  catch (e) { if (/row-level security/.test(e.message)) return false; throw e; }
};
const seen = async (uid, bucket, name) => (await as(uid, `select count(*)::int n from storage.objects where bucket_id = '${bucket}' and name = '${name}'`)).rows[0].n;
const del = async (uid, bucket, name) => (await as(uid, `delete from storage.objects where bucket_id = '${bucket}' and name = '${name}' returning 1`)).rows.length;

await check('Duqm user cannot store an office logo, vehicle photo or receipt in Head Office\'s folders', async () => {
  for (const [b, n] of [['media', `${HO}/logos/x-logo.png`], ['media', `${HO}/vehicles/x-photo.jpg`],
                        ['documents', `${HO}/expenses/x-receipt.jpg`], ['documents', `${HO}/invoices/x-bill.pdf`]]) {
    assert(!(await put(OTHER, b, n)), `${b}/${n} accepted`);
  }
  return '4 writes refused';
});

await check('the same user can store them in their own office\'s folders', async () => {
  for (const [b, n] of [['media', `${DQ}/logos/y-logo.png`], ['media', `${DQ}/vehicles/y-photo.jpg`], ['documents', `${DQ}/expenses/y-receipt.jpg`]]) {
    assert(await put(OTHER, b, n), `${b}/${n} refused`);
  }
  return '3 writes accepted';
});

await check('files of one office cannot be read or deleted from another office', async () => {
  assert(await put(FLEET, 'media', `${HO}/vehicles/z-photo.jpg`), 'HO upload');
  assert((await seen(OTHER, 'media', `${HO}/vehicles/z-photo.jpg`)) === 0, 'Duqm user sees the Head Office photo');
  assert((await del(OTHER, 'media', `${HO}/vehicles/z-photo.jpg`)) === 0, 'Duqm user deleted it');
  assert((await seen(FLEET, 'media', `${HO}/vehicles/z-photo.jpg`)) === 1, 'Head Office user cannot see it');
  return 'not visible, not deleted';
});

await check('a replaced office logo can be removed by a user who may edit that office', async () => {
  assert((await del(OTHER, 'media', `${DQ}/logos/y-logo.png`)) === 1, 'not removed');
  return 'removed';
});

await check('a Viewer cannot store an office logo even in their own office', async () => {
  assert(!(await put(VIEWER, 'media', `${HO}/logos/v-logo.png`)), 'accepted');
  return 'refused';
});

await check('the organization logo needs settings:edit; every signed-in user can read it', async () => {
  assert(!(await put(VIEWER, 'media', 'organization/logo-1-v.png')), 'Viewer stored the organization logo');
  assert(await put(ADMIN, 'media', 'organization/logo-2-a.png'), 'Super Admin refused');
  assert((await seen(OTHER, 'media', 'organization/logo-2-a.png')) === 1, 'not readable');
  assert((await del(VIEWER, 'media', 'organization/logo-2-a.png')) === 0, 'Viewer deleted it');
  assert((await del(ADMIN, 'media', 'organization/logo-2-a.png')) === 1, 'Super Admin could not remove the replaced logo');
  return 'write: settings editors; read: everyone signed in';
});

await check('paths outside the <office>/<entity>/ layout are refused', async () => {
  assert(!(await put(ADMIN, 'media', `${HO}/x.png`)), 'no entity folder');
  assert(!(await put(ADMIN, 'media', `${HO}/secrets/x.png`)), 'unknown entity');
  assert(!(await put(ADMIN, 'media', `not-an-office/logos/x.png`)), 'not an office id');
  return '3 refused';
});

t.report();
