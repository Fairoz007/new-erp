// Storage limits: the browser's checks (src/services/storage.ts BUCKETS) and the buckets agree, and
// the buckets are private. Standalone: node supabase/tests/storage_limits.test.mjs supabase/migrations
import { readFileSync } from 'node:fs';
import { setup } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { check, asServer, assert } = t;
const src = readFileSync(new URL('../../src/services/storage.ts', import.meta.url), 'utf8');
const ts = {};
for (const m of src.matchAll(/(\w+):\s*\{\s*id: '(\w+)',\s*maxBytes: (\d+) \* 1024 \* 1024,\s*mimeTypes: \[([^\]]+)\]/g))
  ts[m[2]] = { size: Number(m[3]) * 1024 * 1024, mimes: [...m[4].matchAll(/'([^']+)'/g)].map(x => x[1]).sort() };

const exists = (await asServer(`select to_regclass('storage.buckets') is not null e`)).rows[0].e;
await check('browser bucket config parsed', () => { assert(ts.documents && ts.media, JSON.stringify(ts)); return Object.keys(ts).join(', '); });
if (exists) {
  const rows = (await asServer(`select id, public, file_size_limit::bigint s, allowed_mime_types m from storage.buckets where id in ('documents','media')`)).rows;
  for (const r of rows) {
    await check(`bucket ${r.id}: private, size and types match the browser`, () => {
      assert(r.public === false, 'public'); assert(Number(r.s) === ts[r.id].size, `${r.s} vs ${ts[r.id].size}`);
      assert(JSON.stringify([...r.m].sort()) === JSON.stringify(ts[r.id].mimes), `${r.m} vs ${ts[r.id].mimes}`); return `${r.s} bytes, ${r.m.join(' ')}`;
    });
  }
  await check('both buckets exist', () => { assert(rows.length === 2, rows.length); return '2'; });
}
await check('the migration updates existing buckets with the same values', () => {
  const sql = readFileSync(new URL('../migrations/20261113004000_storage_limits.sql', import.meta.url), 'utf8');
  assert(sql.includes(`file_size_limit = ${ts.documents.size}`) && sql.includes(`file_size_limit = ${ts.media.size}`), 'sizes differ'); return 'ok';
});
t.report();
