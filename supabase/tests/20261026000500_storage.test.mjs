// Storage policy tests (Agent F). Standalone: boots its own PGlite, loads every migration, runs checks.
//   node supabase/tests/20261026000500_storage.test.mjs supabase/migrations
// (Can be wired into the shared runner later: it only needs the same auth/storage stubs as schema.test.mjs.)
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
  try { await db.exec(readFileSync(join(dir, f), 'utf8')); console.log('OK   migration', f); }
  catch (e) { console.log('FAIL migration', f, '\n  ', e.message); process.exit(1); }
}

const results = [];
const check = async (name, fn, expectError) => {
  try { const r = await fn(); results.push([expectError ? 'FAIL' : 'PASS', name, expectError ? 'expected error, got success' : (r ?? '')]); }
  catch (e) { results.push([expectError && (expectError === true || e.message.includes(expectError)) ? 'PASS' : 'FAIL', name, e.message]); }
};
const as = async (uid, sql) => {
  await db.exec(`set role authenticated; select set_config('request.uid', '${uid}', false);`);
  try { return await db.query(sql); } finally { await db.exec('reset role;'); }
};

const ADMIN = '00000000-0000-0000-0000-00000000000a', ACCT = '00000000-0000-0000-0000-00000000000b',
      FLEET = '00000000-0000-0000-0000-00000000000c', OTHER = '00000000-0000-0000-0000-00000000000d',
      VIEWER = '00000000-0000-0000-0000-00000000000e';
const HO = '11111111-1111-1111-1111-111111111111', DQ = '22222222-2222-2222-2222-222222222222';
await db.exec(`
  insert into auth.users (id, email) values ('${ADMIN}','a@x'),('${ACCT}','ac@x'),('${FLEET}','f@x'),('${OTHER}','o@x'),('${VIEWER}','v@x');
  update public.profiles set role = 'Super Admin' where id = '${ADMIN}';
  update public.profiles set role = 'Accountant' where id = '${ACCT}';
  update public.profiles set role = 'Fleet Manager' where id in ('${FLEET}','${OTHER}');
  update public.profiles set role = 'Viewer' where id = '${VIEWER}';
  insert into public.companies (id, name, code) values ('${HO}','Head Office','HO'), ('${DQ}','Duqm','DQ');
  insert into public.company_members values ('${ACCT}','${HO}'),('${FLEET}','${HO}'),('${VIEWER}','${HO}'),('${OTHER}','${DQ}')
    on conflict do nothing;
`);
const put = (uid, bucket, name) => as(uid, `insert into storage.objects (bucket_id, name) values ('${bucket}', '${name}')`);
const del = (uid, bucket, name) => as(uid, `delete from storage.objects where bucket_id='${bucket}' and name='${name}' returning 1`);
const seeOwner = async (bucket, name) => (await db.query(`select count(*)::int n from storage.objects where bucket_id='${bucket}' and name='${name}'`)).rows[0].n;
const visible = async (uid, bucket, name) => (await as(uid, `select count(*)::int n from storage.objects where bucket_id='${bucket}' and name='${name}'`)).rows[0].n;

await check('buckets: documents private 10MB pdf/png/jpeg', async () => {
  const b = (await db.query(`select * from storage.buckets where id='documents'`)).rows[0];
  if (b.public || Number(b.file_size_limit) !== 10485760 || b.allowed_mime_types.length !== 3) throw new Error(JSON.stringify(b));
});
await check('buckets: media private 5MB image/*', async () => {
  const b = (await db.query(`select * from storage.buckets where id='media'`)).rows[0];
  if (b.public || Number(b.file_size_limit) !== 5242880 || !b.allowed_mime_types.includes('image/webp')) throw new Error(JSON.stringify(b));
});

// documents bucket
await check('Fleet Manager uploads to own company documents/', () => put(FLEET, 'documents', `${HO}/documents/a-mulkiya.pdf`));
await check('upload outside own company rejected', () => put(FLEET, 'documents', `${DQ}/documents/b.pdf`), 'row-level security');
await check('path without entity folder rejected', () => put(FLEET, 'documents', `${HO}/b.pdf`), 'row-level security');
await check('unknown entity folder rejected', () => put(FLEET, 'documents', `${HO}/secrets/b.pdf`), 'row-level security');
await check('Accountant can attach to invoices/ (invoices:create)', () => put(ACCT, 'documents', `${HO}/invoices/c-bill.pdf`));
await check('Accountant cannot upload to documents/ (view only)', () => put(ACCT, 'documents', `${HO}/documents/d.pdf`), 'row-level security');
await check('Viewer cannot upload anywhere', () => put(VIEWER, 'documents', `${HO}/expenses/e.pdf`), 'row-level security');
await check('Fleet Manager cannot attach to invoices/ (no invoices access)', () => put(FLEET, 'documents', `${HO}/invoices/f.pdf`), 'row-level security');
await check('other-company user cannot read HO file', async () => {
  if (await visible(OTHER, 'documents', `${HO}/documents/a-mulkiya.pdf`) !== 0) throw new Error('leak');
});
await check('Viewer can read documents/ file', async () => {
  if (await visible(VIEWER, 'documents', `${HO}/documents/a-mulkiya.pdf`) !== 1) throw new Error('cannot read');
});
await check('Viewer cannot read invoices/ file (role has no invoices page access)', async () => {
  if (await visible(VIEWER, 'documents', `${HO}/invoices/c-bill.pdf`) !== 0) throw new Error('leak');
});
await check('Fleet Manager cannot read invoices/ file (no module access)', async () => {
  if (await visible(FLEET, 'documents', `${HO}/invoices/c-bill.pdf`) !== 0) throw new Error('leak');
});
await check('Viewer cannot delete documents/ file', async () => {
  await del(VIEWER, 'documents', `${HO}/documents/a-mulkiya.pdf`);
  if (await seeOwner('documents', `${HO}/documents/a-mulkiya.pdf`) !== 1) throw new Error('deleted');
});
await check('Fleet Manager can delete documents/ file', async () => {
  await del(FLEET, 'documents', `${HO}/documents/a-mulkiya.pdf`);
  if (await seeOwner('documents', `${HO}/documents/a-mulkiya.pdf`) !== 0) throw new Error('not deleted');
});
await check('Accountant can remove own invoice attachment (invoices:edit)', async () => {
  await del(ACCT, 'documents', `${HO}/invoices/c-bill.pdf`);
  if (await seeOwner('documents', `${HO}/invoices/c-bill.pdf`) !== 0) throw new Error('not deleted');
});

// media bucket
await check('Fleet Manager uploads vehicle photo', () => put(FLEET, 'media', `${HO}/vehicles/p-front.jpg`));
await check('Viewer cannot upload vehicle photo', () => put(VIEWER, 'media', `${HO}/vehicles/q.jpg`), 'row-level security');
await check('Viewer can read vehicle photo (company member)', async () => {
  if (await visible(VIEWER, 'media', `${HO}/vehicles/p-front.jpg`) !== 1) throw new Error('cannot read');
});
await check('other company cannot read vehicle photo', async () => {
  if (await visible(OTHER, 'media', `${HO}/vehicles/p-front.jpg`) !== 0) throw new Error('leak');
});
await check('logo upload needs companies:edit (Fleet Manager has it? checks matrix)', async () => {
  const can = (await db.query(`select exists(select 1 from role_permissions where role='Fleet Manager' and module='companies' and action='edit') x`)).rows[0].x;
  let ok = true; try { await put(FLEET, 'media', `${HO}/logos/l.png`); } catch { ok = false; }
  if (ok !== can) throw new Error(`policy (${ok}) disagrees with matrix (${can})`);
  return `matrix=${can}`;
});
await check('avatar only in own folder', async () => {
  await put(VIEWER, 'media', `${HO}/avatars/${VIEWER}/a.png`);
  let rejected = false; try { await put(VIEWER, 'media', `${HO}/avatars/${FLEET}/a.png`); } catch { rejected = true; }
  if (!rejected) throw new Error("wrote into someone else's avatar folder");
});
await check('unknown media entity rejected', () => put(FLEET, 'media', `${HO}/misc/x.png`), 'row-level security');

// row/path integrity
await check('documents row must point inside its own company', () => db.exec(
  `insert into documents (company_id, document_name, category, storage_path) values ('${HO}','x','Other','${DQ}/documents/z.pdf')`), 'documents_path_in_company');
await check('two rows cannot share one object', async () => {
  await db.exec(`insert into documents (company_id, document_name, category, storage_path) values ('${HO}','x','Other','${HO}/documents/s.pdf')`);
  await db.exec(`insert into documents (company_id, document_name, category, storage_path) values ('${HO}','y','Other','${HO}/documents/s.pdf')`);
}, 'duplicate key');
await check('documents.file_size / mime constraints', () => db.exec(
  `insert into documents (company_id, document_name, category, mime_type) values ('${HO}','x','Other','application/zip')`), 'check');

// orphans
await check('storage_orphans lists unreferenced, hides referenced', async () => {
  await db.exec(`insert into storage.objects (bucket_id, name) values ('documents','${HO}/documents/s.pdf'),('documents','${HO}/documents/orphan.pdf')`);
  const r = (await as(ADMIN, `select name from storage_orphans('documents')`)).rows.map(x => x.name);
  if (!r.includes(`${HO}/documents/orphan.pdf`) || r.includes(`${HO}/documents/s.pdf`)) throw new Error(JSON.stringify(r));
});
await check('storage_orphans denied to Viewer', () => as(VIEWER, `select * from storage_orphans('documents')`), 'Permission denied');

for (const [s, n, d] of results) console.log(s.padEnd(5), n, d ? '— ' + String(d).slice(0, 160) : '');
const fails = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
