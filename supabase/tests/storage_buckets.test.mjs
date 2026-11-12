// The two storage buckets exist with their limits, and are recreated if they were removed
// (20261113010000_storage_buckets.sql).
import { readFileSync } from 'fs';
import { setup } from './harness.mjs';
const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { check, asServer, assert, db } = t;
const sql = readFileSync('supabase/migrations/20261113010000_storage_buckets.sql', 'utf8');
const buckets = async () => (await asServer(`select id, public, file_size_limit::int l, array_to_string(allowed_mime_types, ',') m from storage.buckets order by id`)).rows;
const expected = 'documents false 10485760 application/pdf,image/png,image/jpeg|media false 5242880 image/png,image/jpeg,image/webp';
const show = r => r.map(b => `${b.id} ${b.public} ${b.l} ${b.m}`).join('|');

await check('after all migrations: documents and media, private, with their limits', async () => {
  const r = show(await buckets()); assert(r === expected, r); return 'ok';
});
await check('removed buckets are created again with the same settings', async () => {
  await db.exec(`delete from storage.buckets`);
  await db.exec(sql);
  const r = show(await buckets()); assert(r === expected, r); return 'recreated';
});
await check('running it on existing buckets changes nothing else (idempotent)', async () => {
  await db.exec(sql); await db.exec(sql);
  const r = show(await buckets()); assert(r === expected, r); return 'same';
});
t.report();
