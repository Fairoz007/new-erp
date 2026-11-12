// Read-only export of the linked project's data, for a backup point where `supabase db dump`
// cannot run (it needs Docker):  node scripts/release/export-data.mjs backups/<name>
// Writes one JSON file per non-empty public table, auth.users (id, email, metadata), the column
// list and function hashes (line endings ignored) used by rehearse-push.mjs, and manifest.json.
// The output holds real data: `backups/` is git-ignored; keep it somewhere safe and private.
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
const out = process.argv[2];
mkdirSync(out, { recursive: true });
function q(sql) {
  const s = execFileSync('supabase', ['db', 'query', '--linked', sql], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
  const i = s.indexOf('{');
  // the CLI may append a version notice; parse the first JSON value only
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let k = i; k < s.length; k++) { const c = s[k];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { if (--depth === 0) { end = k; break; } } }
  return JSON.parse(s.slice(i, end + 1)).rows;
}
const tables = q(`select table_name t from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`).map(r => r.t);
const manifest = {};
for (const t of tables) {
  const rows = q(`select coalesce(json_agg(x), '[]'::json)::text j from public."${t}" x`)[0].j;
  const data = JSON.parse(rows);
  manifest[t] = data.length;
  if (data.length) writeFileSync(`${out}/public.${t}.json`, JSON.stringify(data, null, 1));
}
const users = JSON.parse(q(`select coalesce(json_agg(json_build_object('id', id, 'email', email, 'raw_user_meta_data', raw_user_meta_data)), '[]')::text j from auth.users`)[0].j);
writeFileSync(`${out}/auth.users.json`, JSON.stringify(users, null, 1));
manifest['auth.users'] = users.length;
const schema = q(`select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema='public' order by 1, 2`);
writeFileSync(`${out}/schema.columns.json`, JSON.stringify(schema));
const fns = q(`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' f, md5(replace(p.prosrc, E'\\r', '')) h from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1`);
writeFileSync(`${out}/schema.functions.json`, JSON.stringify(fns));
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(manifest).filter(([, n]) => n))), tables.length, 'tables', fns.length, 'functions');
