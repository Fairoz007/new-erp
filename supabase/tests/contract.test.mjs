// Service <-> schema contract test (Agent J).
// Standalone: node supabase/tests/contract.test.mjs supabase/migrations   (also run by `npm run test:db`)
//
// Boots PGlite with ALL migrations (harness.mjs) and verifies, against the migrated catalog, every
// PostgREST call that src/services/*.ts makes. supabase-js only fails these at runtime, and most
// call sites are typed `as any`, so tsc cannot catch them.
//
// Part 1 - static extraction (small hand-written scanner, no TS compiler needed):
//   * query chains starting at `supabase.from('t')`, `(supabase.from('t') as any)`, the per-file
//     helper `table('t')`, and the paging helpers `fetchAll('t', SELECT, order, ...)` (fleet.ts,
//     finance.ts); select strings may be literals, template literals or `const X = '..' + '..'`.
//   * per chain: select (columns, embeds, FK hints), eq/neq/gt/gte/lt/lte/like/ilike/is/in/order
//     columns, insert/update/upsert payload keys (object literals, `row.x = ...` assignments,
//     spreads/calls of the file's *ToRow mappers incl. the `m('key','col')` / `set('col', v)`
//     helpers, minus `delete row.x`), upsert onConflict columns, delete.
//   * every `rpcAny('fn', {..})` call: function exists, argument names match exactly one overload
//     (PostgREST matches by name), required args present, EXECUTE granted to `authenticated`, and
//     keys of jsonb arguments built from mappers / literals are read by the function body.
//   * embeds: a real FK between the two relations in either direction (or an M2M junction whose FK
//     columns are in its PK, as PostgREST requires), unambiguous unless `!hint` is given.
//   * privileges: SELECT on every selected column (a `*` fails if ANY column is revoked), INSERT /
//     UPDATE on every written column, DELETE on deleted tables, for role `authenticated`.
// Part 2 - mapper round trips (dynamic): the services are bundled with esbuild (lib/supabase
//   stubbed) and every rowToX mapper is fed a row synthesized from the catalog in exactly the shape
//   its select returns (embeds as object/array per FK cardinality). A Proxy records any key the
//   mapper reads that the select does not return (=> silent blank / 0 in the UI).
//   Inline mappers (chart of accounts, bank accounts, aging, memberships) are checked statically.
//
// What the scanner can NOT parse (checked by hand, listed in docs/audit/agent-J.md):
//   * the helper bodies themselves (`table(name)` inside fetchAll) - their callers are resolved;
//   * dynamic column names (none today); `.or()` filter strings (none today);
//   * storage.from(bucket) calls (Storage API, not PostgREST) and supabase.auth.* calls.
// A guard check fails if the number of textual `.from(` / `table(` / `rpcAny(` occurrences differs
// from what was parsed + the documented helper-internal exceptions, so new unparseable call sites
// cannot slip through silently.
import { setup } from './harness.mjs';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
// CONTRACT_SERVICES_DIR lets the self-test point the scanner at a mutated copy of src/services.
const SERVICES = process.env.CONTRACT_SERVICES_DIR || join(root, 'src', 'services');
const migDir = process.argv[2] || join(root, 'supabase', 'migrations');

const t = await setup(migDir, { quiet: true });
const { db, check } = t;
const q = async (sql) => (await db.query(sql)).rows;

// =============================================================================================
// Catalog
// =============================================================================================
const rels = new Map();   // name -> { kind, cols: Map(col -> {type, udt}) }
for (const r of await q(`select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
                         where n.nspname = 'public' and c.relkind in ('r','v','m','p')`)) {
  rels.set(r.relname, { kind: r.relkind === 'v' || r.relkind === 'm' ? 'view' : 'table', cols: new Map() });
}
for (const r of await q(`select table_name, column_name, data_type, udt_name,
                                (is_nullable = 'NO' and column_default is null and is_generated = 'NEVER' and is_identity = 'NO') as required
                         from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`)) {
  rels.get(r.table_name)?.cols.set(r.column_name, { type: r.data_type, udt: r.udt_name, required: r.required });
}
const fks = await q(`
  select con.conname, cl.relname as src, cf.relname as tgt,
         array(select a.attname::text from unnest(con.conkey) with ordinality k(n, o)
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.o) as src_cols,
         array(select a.attname::text from unnest(con.confkey) with ordinality k(n, o)
               join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.o) as tgt_cols
  from pg_constraint con
  join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
  join pg_class cf on cf.oid = con.confrelid join pg_namespace nf on nf.oid = cf.relnamespace
  where con.contype = 'f' and n.nspname = 'public' and nf.nspname = 'public'`);
const uniques = await q(`
  select cl.relname as tbl, i.indisprimary as pk,
         array(select a.attname::text from unnest(i.indkey) k(n) join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.n) as cols
  from pg_index i join pg_class cl on cl.oid = i.indrelid join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public' and i.indisunique and i.indpred is null`);
const enums = new Map();
for (const r of await q(`select t.typname, e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid order by t.typname, e.enumsortorder`)) {
  if (!enums.has(r.typname)) enums.set(r.typname, r.enumlabel);
}
const funcs = await q(`
  select p.oid, p.proname, p.proargnames, p.proargmodes::text[] as modes, p.pronargs, p.pronargdefaults, p.prosrc,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
const inArgs = (f) => (f.proargnames ?? []).filter((_, i) => !f.modes || ['i', 'b', 'v'].includes(f.modes[i])).slice(0, f.pronargs);

const privCache = new Map();
async function colPriv(tbl, col, priv) {
  const k = `${tbl}.${col}.${priv}`;
  if (!privCache.has(k)) {
    const r = await q(`select has_column_privilege('authenticated', 'public.${tbl}', '${col}', '${priv}') as ok`);
    privCache.set(k, r[0].ok);
  }
  return privCache.get(k);
}
async function tblPriv(tbl, priv) {
  const k = `${tbl}..${priv}`;
  if (!privCache.has(k)) {
    const r = await q(`select has_table_privilege('authenticated', 'public.${tbl}', '${priv}') as ok`);
    privCache.set(k, r[0].ok);
  }
  return privCache.get(k);
}

// =============================================================================================
// Scanner
// =============================================================================================
// Blank out comments (keeping offsets / line numbers) so commented-out code is never parsed.
function stripComments(s) {
  let out = '';
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && s[i + 1] === '*') {
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) { out += s[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2; continue;
    }
    if (c === '\'' || c === '"' || c === '`') { const e = skipString(s, i); out += s.slice(i, e); i = e; continue; }
    if (c === '/' && isRegexStart(s, i)) { const e = skipRegex(s, i); out += s.slice(i, e); i = e; continue; }
    out += c; i++;
  }
  return out;
}
function isRegexStart(s, i) {
  let j = i - 1; while (j >= 0 && /\s/.test(s[j])) j--;
  if (j < 0) return true;
  if ('(,=:[!&|?{};+'.includes(s[j])) return true;
  return /\b(return|typeof|case)$/.test(s.slice(Math.max(0, j - 6), j + 1));
}
function skipRegex(s, i) {
  let j = i + 1, cls = false;
  for (; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '[') cls = true; else if (s[j] === ']') cls = false;
    else if (s[j] === '/' && !cls) break;
    else if (s[j] === '\n') return i + 1; // not a regex after all
  }
  j++; while (/[a-z]/i.test(s[j] ?? '')) j++;
  return j;
}
// returns index just past the closing quote
function skipString(s, i) {
  const q0 = s[i];
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === '\\') { j += 2; continue; }
    if (q0 === '`' && s[j] === '$' && s[j + 1] === '{') { j = matchBracket(s, j + 1) + 1; continue; }
    if (s[j] === q0) return j + 1;
    j++;
  }
  return j;
}
// s[i] is an opening bracket; returns index of its matching closer
function matchBracket(s, i) {
  const open = s[i], close = { '(': ')', '[': ']', '{': '}', '<': '>' }[open];
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\'' || c === '"' || c === '`') { j = skipString(s, j) - 1; continue; }
    if (c === '/' && open !== '<' && isRegexStart(s, j) && s[j + 1] !== '/' && s[j + 1] !== '*') { j = skipRegex(s, j) - 1; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return j; }
  }
  throw new Error(`unbalanced ${open} at ${i}`);
}
function splitTop(s, sep = ',') {
  const parts = []; let depth = 0, start = 0;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (c === '\'' || c === '"' || c === '`') { j = skipString(s, j) - 1; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === sep && depth === 0) { parts.push(s.slice(start, j)); start = j + 1; }
  }
  parts.push(s.slice(start));
  return parts.map(p => p.trim()).filter(p => p.length);
}
const lineOf = (s, i) => s.slice(0, i).split('\n').length;
const stripAs = (e) => e.trim().replace(/\s+as\s+[\w<>[\]'|. ]+$/, '').trim();

// Evaluate a string expression: literal, template without ${}, identifier const, or a + b.
function evalStr(expr, consts) {
  expr = stripAs(expr);
  const parts = splitTop(expr, '+');
  if (parts.length > 1) {
    const vals = parts.map(p => evalStr(p, consts));
    return vals.some(v => v == null) ? null : vals.join('');
  }
  const m = expr.match(/^(['"])([\s\S]*)\1$/);
  if (m) return m[2];
  const tm = expr.match(/^`([\s\S]*)`$/);
  if (tm && !tm[1].includes('${')) return tm[1];
  if (/^\w+$/.test(expr) && consts.has(expr)) return consts.get(expr);
  return null;
}

function fileConsts(src) {
  const consts = new Map();
  const re = /\bconst\s+(\w+)\s*(?::\s*[\w<>[\]]+\s*)?=\s*/g;
  let m;
  while ((m = re.exec(src))) {
    let j = re.lastIndex, depth = 0;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === '\'' || c === '"' || c === '`') { j = skipString(src, j) - 1; continue; }
      if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
      else if (c === ';' && depth === 0) break;
    }
    const v = evalStr(src.slice(re.lastIndex, j), consts);
    if (v != null) consts.set(m[1], v);
  }
  return consts;
}

// Function body text for a named function/const arrow in a file.
function functionBody(src, name) {
  const re = new RegExp(`(?:function\\s+${name}\\s*(?:<[^>]*>)?\\s*\\(|const\\s+${name}\\s*=\\s*(?:async\\s*)?(?:<[^>]*>)?\\s*\\()`);
  const m = re.exec(src);
  if (!m) return null;
  const pOpen = m.index + m[0].length - 1;
  let j = matchBracket(src, pOpen) + 1;
  // skip return type annotation up to `=>` or `{`
  while (j < src.length && src[j] !== '{' && !(src[j] === '=' && src[j + 1] === '>')) j++;
  if (src[j] === '=') { j += 2; while (/\s/.test(src[j])) j++; }
  if (src[j] === '(' || src[j] === '{') return { text: src.slice(j, matchBracket(src, j) + 1), exprObj: src[j] === '(' };
  return null;
}

function objectKeys(lit, src, consts, seen) {
  const inner = lit.trim().replace(/^\(\s*/, '').replace(/\s*\)$/, '').trim();
  if (!inner.startsWith('{')) return null;
  const keys = new Set();
  for (const part of splitTop(inner.slice(1, matchBracket(inner, 0)))) {
    if (part.startsWith('...')) {
      const sub = payloadKeys(part.slice(3), src, consts, null, seen);
      if (!sub) return null;
      sub.forEach(k => keys.add(k));
      continue;
    }
    const km = part.match(/^(?:(['"])(\w+)\1|(\w+))\s*(?::|$)/);
    if (km) keys.add(km[2] ?? km[3]);
  }
  return keys;
}

// Keys written by a *ToRow-style mapper (patcher m('key','col'), set('col', v), row.col = v, object literal).
function mapperKeys(src, name, consts, seen = new Set()) {
  if (seen.has(name)) return new Set();
  seen.add(name);
  const body = functionBody(src, name);
  if (!body) return null;
  if (body.exprObj) return objectKeys(body.text, src, consts, seen);
  const keys = new Set();
  for (const m of body.text.matchAll(/\bm\(\s*'[^']+'\s*,\s*'(\w+)'/g)) keys.add(m[1]);
  for (const m of body.text.matchAll(/\bset\(\s*'(\w+)'/g)) keys.add(m[1]);
  for (const m of body.text.matchAll(/\b(?:row|o|out)\.(\w+)\s*=(?![=>])/g)) keys.add(m[1]);
  for (const m of body.text.matchAll(/\b(?:const|let)\s+(?:row|o|out)\s*(?::[^=]+)?=\s*(\w+)\(/g)) {
    (mapperKeys(src, m[1], consts, seen) ?? []).forEach(k => keys.add(k));
  }
  for (const m of body.text.matchAll(/\breturn\s+(\{[\s\S]*?\});/g)) (objectKeys(m[1], src, consts, seen) ?? []).forEach(k => keys.add(k));
  return keys;
}

// Resolve the payload expression of insert/update/upsert (or a jsonb RPC argument) to its keys.
function payloadKeys(expr, src, consts, callPos, seen = new Set()) {
  expr = stripAs(expr);
  if (expr.startsWith('{') || expr.startsWith('({')) return objectKeys(expr, src, consts, seen);
  let m = expr.match(/^(\w+)\(/);                       // mapper call
  if (m) return mapperKeys(src, m[1], consts, seen);
  m = expr.match(/^[\w.?]+\.map\(\s*(\w+)\s*\)$/);      // list.map(mapper)
  if (m) return mapperKeys(src, m[1], consts, seen);
  m = expr.match(/^[\w.?]+\.map\(\s*\(?\s*\w+\s*\)?\s*=>\s*([\s\S]*)\)$/);   // list.map(l => ({...}))
  if (m) return payloadKeys(m[1], src, consts, callPos, seen);
  if (/^\w+$/.test(expr) && callPos != null) {           // local variable: last definition before the call
    const defRe = new RegExp(`\\b(?:const|let)\\s+${expr}\\s*(?::\\s*[^=]+)?=\\s*`, 'g');
    let def = null, d;
    while ((d = defRe.exec(src)) && d.index < callPos) def = d;
    if (!def) return null;
    let j = defRe.lastIndex ?? def.index + def[0].length;
    j = def.index + def[0].length;
    let k = j, depth = 0;
    for (; k < src.length; k++) {
      const c = src[k];
      if (c === '\'' || c === '"' || c === '`') { k = skipString(src, k) - 1; continue; }
      if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
      else if (c === ';' && depth === 0) break;
    }
    const keys = payloadKeys(src.slice(j, k), src, consts, null, seen);
    if (!keys) return null;
    const region = src.slice(k, callPos);
    for (const a of region.matchAll(new RegExp(`\\b${expr}\\.(\\w+)\\s*=(?![=>])`, 'g'))) keys.add(a[1]);
    for (const a of region.matchAll(new RegExp(`\\bdelete\\s+${expr}\\.(\\w+)`, 'g'))) keys.delete(a[1]);
    return keys;
  }
  return null;
}

// NOT NULL columns without default that BEFORE INSERT triggers fill (verified by reading the triggers).
const TRIGGER_FILLED = new Set([
]);

const FILTERS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'order']);
const IGNORED = new Set(['range', 'limit', 'single', 'maybeSingle', 'then', 'abortSignal', 'returns', 'csv', 'throwOnError']);

const files = readdirSync(SERVICES).filter(f => f.endsWith('.ts')).sort();
const sites = [];        // { file, line, table, ops: [{ method, args }] , label }
const rpcs = [];         // { file, line, fn, keys: Set|null, jsonKeys: {arg -> Set} }
const unresolved = [];   // { file, line, why }
const textual = { from: 0, table: 0, rpc: 0 };
const consts = {};
const srcs = {};

for (const file of files) {
  const raw = readFileSync(join(SERVICES, file), 'utf8');
  const src = stripComments(raw);
  srcs[file] = src;
  const C = fileConsts(src);
  consts[file] = C;
  const hasTableHelper = /const\s+table\s*=/.test(src);
  const pagingHelper = /async function fetchAll\(name: string/.test(src) ? file : null;

  const starts = [];
  for (const m of src.matchAll(/\bsupabase\s*\.\s*from\s*\(/g)) { textual.from++; starts.push({ pos: m.index + m[0].length - 1, kind: 'from' }); }
  if (hasTableHelper) for (const m of src.matchAll(/(?<![.\w])table\s*\(/g)) { textual.table++; starts.push({ pos: m.index + m[0].length - 1, kind: 'table' }); }
  if (pagingHelper) for (const m of src.matchAll(/(?<![.\w])fetchAll\s*\(\s*['"`]/g)) starts.push({ pos: src.indexOf('(', m.index), kind: 'fetchAll' });

  for (const st of starts) {
    const close = matchBracket(src, st.pos);
    const args = splitTop(src.slice(st.pos + 1, close));
    const line = lineOf(src, st.pos);
    const tableName = evalStr(args[0] ?? '', C);
    if (tableName == null) { unresolved.push({ file, line, why: `table name expression \`${args[0]}\`` }); continue; }
    const ops = [];
    if (st.kind === 'fetchAll') {
      ops.push({ method: 'select', args: [args[1]] });
      if (file === 'fleet.ts') {
        const col = (args[2] ?? '').match(/column:\s*'(\w+)'/)?.[1] ?? 'created_at';
        ops.push({ method: 'order', args: [`'${col}'`] }, { method: 'order', args: [`'id'`] });
      } else {
        ops.push({ method: 'order', args: [args[2] ?? `'created_at'`] });
        for (const f of (args[4] ?? '').matchAll(/\.(eq|neq|in|is|gt|gte|lt|lte)\(\s*('\w+')/g)) ops.push({ method: f[1], args: [f[2]] });
      }
      sites.push({ file, line, table: tableName, ops, label: 'fetchAll' });
      continue;
    }
    // follow the method chain
    let j = close + 1;
    const asAny = src.slice(j).match(/^\s*as\s+any\s*\)/);
    if (asAny) j += asAny[0].length;
    for (;;) {
      const mm = src.slice(j).match(/^\s*\.\s*(\w+)\s*(<[^()]*>)?\s*\(/);
      if (!mm) break;
      const open = j + mm[0].length - 1;
      const end = matchBracket(src, open);
      ops.push({ method: mm[1], args: splitTop(src.slice(open + 1, end)), pos: open });
      j = end + 1;
    }
    sites.push({ file, line, table: tableName, ops, label: st.kind });
  }

  for (const m of src.matchAll(/\brpcAny\s*(<[^()]*?>)?\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    if (/export async function rpcAny/.test(src.slice(Math.max(0, m.index - 30), m.index + 6))) continue; // definition in core.ts
    textual.rpc++;
    const args = splitTop(src.slice(open + 1, matchBracket(src, open)));
    const line = lineOf(src, open);
    const fn = evalStr(args[0], C);
    if (fn == null) { unresolved.push({ file, line, why: `rpc name \`${args[0]}\`` }); continue; }
    let keys = new Set(), jsonKeys = {};
    if (args[1]) {
      const obj = stripAs(args[1]);
      if (!obj.startsWith('{')) { unresolved.push({ file, line, why: `rpc args \`${obj}\`` }); continue; }
      keys = new Set();
      for (const part of splitTop(obj.slice(1, matchBracket(obj, 0)))) {
        const km = part.match(/^(\w+)\s*(?::\s*([\s\S]*))?$/);
        if (!km) { unresolved.push({ file, line, why: `rpc arg \`${part}\`` }); continue; }
        keys.add(km[1]);
        const val = km[2] ?? km[1];
        const jk = payloadKeys(val, src, C, null);
        if (jk && jk.size) jsonKeys[km[1]] = jk;
      }
    }
    rpcs.push({ file, line, fn, keys, jsonKeys });
  }
}

// =============================================================================================
// Select-string parser + relationship resolver (PostgREST semantics)
// =============================================================================================
function parseSelect(s) {
  s = s.replace(/\s+/g, '');
  const items = [];
  for (const part of splitTop(s)) {
    if (part === '*') { items.push({ star: true }); continue; }
    const paren = part.indexOf('(');
    if (paren > 0 && part.endsWith(')')) {
      const head = part.slice(0, paren);
      const [aliasOrTarget, rest] = head.includes(':') ? head.split(':') : [null, head];
      const [target, ...hints] = (rest ?? aliasOrTarget).split('!');
      items.push({
        embed: true, alias: head.includes(':') ? aliasOrTarget : target, target,
        hints: hints.filter(h => h !== 'inner' && h !== 'left'), inner: parseSelect(part.slice(paren + 1, -1)),
      });
      continue;
    }
    const [a, b] = part.includes(':') && !part.includes('::') ? part.split(':') : [null, part];
    const col = b.split('::')[0].split('->')[0];
    items.push({ col, alias: a ?? col });
  }
  return items;
}

// Candidate relationships from `origin` to `target` (both relation names).
function relationships(origin, target) {
  const out = [];
  for (const f of fks) {
    if (f.src === origin && f.tgt === target) out.push({ kind: 'M2O', fk: f, card: 'one', hintCols: f.src_cols });
    if (f.src === target && f.tgt === origin && origin !== target) {
      const unique = uniques.some(u => u.tbl === target && u.cols.length === f.src_cols.length && u.cols.every(c => f.src_cols.includes(c)));
      out.push({ kind: unique ? 'O2O' : 'O2M', fk: f, card: unique ? 'one' : 'many', hintCols: f.src_cols });
    }
  }
  // many-to-many through a junction whose FK columns are part of its primary key
  const pks = new Map(uniques.filter(u => u.pk).map(u => [u.tbl, u.cols]));
  for (const f1 of fks) {
    if (f1.tgt !== origin || f1.src === origin || f1.src === target) continue;
    const pk = pks.get(f1.src) ?? [];
    for (const f2 of fks) {
      if (f2 === f1 || f2.src !== f1.src || f2.tgt !== target) continue;
      if ([...f1.src_cols, ...f2.src_cols].every(c => pk.includes(c))) {
        out.push({ kind: 'M2M', fk: f1, fk2: f2, junction: f1.src, card: 'many', hintCols: [] });
      }
    }
  }
  return out;
}

function resolveEmbed(origin, e) {
  const rs = relationships(origin, e.target);
  let cand = rs;
  for (const h of e.hints) {
    cand = cand.filter(r => r.fk.conname === h || r.fk2?.conname === h || r.junction === h
      || (r.hintCols.length === 1 && r.hintCols[0] === h));
  }
  return { all: rs, cand };
}

// Validate a select tree; returns problems and the shape (for synthesizing rows).
function checkSelect(origin, items, problems, path = origin) {
  const rel = rels.get(origin);
  const shape = { table: origin, star: false, cols: [], embeds: [] };
  if (!rel) { problems.push(`${path}: relation "${origin}" does not exist`); return shape; }
  for (const it of items) {
    if (it.star) { shape.star = true; continue; }
    if (!it.embed) {
      if (!rel.cols.has(it.col)) problems.push(`${path}: column "${it.col}" does not exist on ${origin}`);
      shape.cols.push({ col: it.col, alias: it.alias });
      continue;
    }
    const tgt = rels.get(it.target);
    if (!tgt) { problems.push(`${path}: embedded relation "${it.target}" does not exist`); continue; }
    let card = 'one';
    if (rel.kind === 'view' || tgt.kind === 'view') {
      problems.push(`${path}: embed ${it.alias}:${it.target} involves a view - PostgREST infers it from view dependencies; verify manually`);
    } else {
      const { all, cand } = resolveEmbed(origin, it);
      const desc = (r) => `${r.kind} via ${r.fk.conname}${r.fk2 ? ' + ' + r.fk2.conname : ''}`;
      if (all.length === 0) problems.push(`${path}: no foreign key between ${origin} and ${it.target} (PGRST200) for embed "${it.alias}"`);
      else if (cand.length === 0) problems.push(`${path}: hint !${it.hints.join('!')} matches none of: ${all.map(desc).join(', ')}`);
      else if (cand.length > 1) problems.push(`${path}: embed "${it.alias}:${it.target}" is ambiguous (PGRST201): ${cand.map(desc).join(', ')} - add !<fk_name>`);
      else card = cand[0].card;
    }
    const sub = checkSelect(it.target, it.inner, problems, `${path}.${it.alias}`);
    shape.embeds.push({ alias: it.alias, card, shape: sub });
  }
  return shape;
}

async function checkSelectPrivileges(shape, problems, path = shape.table) {
  const rel = rels.get(shape.table);
  if (!rel) return;
  if (!(await tblPriv(shape.table, 'SELECT'))) {
    // column-level grants may still allow the listed columns
    const cols = shape.star ? [...rel.cols.keys()] : shape.cols.map(c => c.col);
    for (const c of cols) if (rel.cols.has(c) && !(await colPriv(shape.table, c, 'SELECT'))) problems.push(`${path}: authenticated lacks SELECT on ${shape.table}.${c}${shape.star ? ' (select * fails)' : ''}`);
  }
  for (const e of shape.embeds) await checkSelectPrivileges(e.shape, problems, `${path}.${e.alias}`);
}

// =============================================================================================
// Part 1 checks: query chains
// =============================================================================================
const shapesByKey = new Map();   // `${table}|${select}` -> shape
for (const site of sites) {
  const name = `contract ${site.file}:${site.line} ${site.table} [${site.ops.map(o => o.method).join('.')}]`;
  await check(name, async () => {
    const problems = [];
    const rel = rels.get(site.table);
    if (!rel) throw new Error(`relation "${site.table}" does not exist`);
    const C = consts[site.file];
    for (const op of site.ops) {
      const a0 = op.args[0];
      if (op.method === 'select') {
        const sel = a0 === undefined ? '*' : evalStr(a0, C);
        if (sel == null) { problems.push(`select argument \`${a0}\` could not be resolved`); continue; }
        const shape = checkSelect(site.table, parseSelect(sel), problems);
        await checkSelectPrivileges(shape, problems);
        shapesByKey.set(`${site.table}|${sel}`, shape);
      } else if (FILTERS.has(op.method)) {
        const col = evalStr(a0, C);
        if (col == null) { problems.push(`.${op.method}(${a0}) column not statically known`); continue; }
        if (/foreignTable|referencedTable/.test(op.args[1] ?? '')) continue;
        if (!rel.cols.has(col)) problems.push(`.${op.method}('${col}'): column does not exist on ${site.table}`);
      } else if (op.method === 'insert' || op.method === 'update' || op.method === 'upsert') {
        const keys = payloadKeys(a0, srcs[site.file], C, op.pos);
        if (!keys) { problems.push(`.${op.method}(${a0.slice(0, 60)}) payload keys could not be resolved`); continue; }
        const priv = op.method === 'update' ? 'UPDATE' : 'INSERT';
        if (rel.kind === 'view') problems.push(`${op.method} into view ${site.table}`);
        for (const k of keys) {
          if (!rel.cols.has(k)) problems.push(`.${op.method}: column "${k}" does not exist on ${site.table}`);
          else if (!(await colPriv(site.table, k, priv))) problems.push(`.${op.method}: authenticated lacks ${priv} on ${site.table}.${k}`);
        }
        if (op.method !== 'update') {
          // NOT NULL columns without a default must be sent, unless a BEFORE INSERT trigger fills them
          const missing = [...rel.cols].filter(([c, info]) => info.required && !keys.has(c) && !TRIGGER_FILLED.has(`${site.table}.${c}`)).map(([c]) => c);
          if (missing.length) problems.push(`.${op.method}: required column(s) not sent: ${missing.join(', ')}`);
        }
        if (op.method === 'upsert') {
          const oc = (op.args[1] ?? '').match(/onConflict:\s*'([^']+)'/)?.[1];
          if (oc) {
            const cols = oc.split(',').map(s => s.trim());
            if (!uniques.some(u => u.tbl === site.table && u.cols.length === cols.length && cols.every(c => u.cols.includes(c)))) {
              problems.push(`.upsert onConflict '${oc}' has no matching unique constraint on ${site.table}`);
            }
          }
        }
      } else if (op.method === 'delete') {
        if (!(await tblPriv(site.table, 'DELETE'))) problems.push(`authenticated lacks DELETE on ${site.table}`);
      } else if (!IGNORED.has(op.method)) {
        problems.push(`unsupported builder method .${op.method}() - extend contract.test.mjs`);
      }
    }
    if (!site.ops.some(o => ['select', 'insert', 'update', 'upsert', 'delete'].includes(o.method))) problems.push('chain has no select/insert/update/delete');
    if (problems.length) throw new Error(problems.join(' | '));
    return 'ok';
  });
}

// =============================================================================================
// Part 1 checks: RPCs
// =============================================================================================
const fnSrc = (f, depth = 2, seen = new Set()) => {
  if (seen.has(f.proname)) return '';
  seen.add(f.proname);
  let s = f.prosrc ?? '';
  if (depth > 0) for (const g of funcs) if (g !== f && new RegExp(`\\b${g.proname}\\s*\\(`).test(f.prosrc ?? '')) s += '\n' + fnSrc(g, depth - 1, seen);
  return s;
};
for (const call of rpcs) {
  await check(`contract rpc ${call.file}:${call.line} ${call.fn}(${[...call.keys].join(', ')})`, async () => {
    const overloads = funcs.filter(f => f.proname === call.fn);
    if (!overloads.length) throw new Error(`function public.${call.fn} does not exist`);
    const matching = overloads.filter(f => {
      const names = inArgs(f);
      const required = names.slice(0, f.pronargs - f.pronargdefaults);
      return [...call.keys].every(k => names.includes(k)) && required.every(r => call.keys.has(r));
    });
    if (matching.length === 0) {
      throw new Error(`no overload of ${call.fn} accepts {${[...call.keys].join(', ')}}; have: ${overloads.map(f => `(${inArgs(f).join(', ')}; ${f.pronargdefaults} defaulted)`).join(' / ')} (PGRST202)`);
    }
    if (matching.length > 1) throw new Error(`${matching.length} overloads of ${call.fn} match (PGRST203)`);
    const f = matching[0];
    const problems = [];
    if (!f.auth_exec) problems.push(`authenticated lacks EXECUTE on ${call.fn}`);
    const body = fnSrc(f);
    for (const [arg, keys] of Object.entries(call.jsonKeys)) {
      for (const k of keys) if (!body.includes(`'${k}'`)) problems.push(`${arg}.${k} is sent but never read by ${call.fn} (or the functions it calls)`);
    }
    if (problems.length) throw new Error(problems.join(' | '));
    return `ok${Object.keys(call.jsonKeys).length ? ' (jsonb keys: ' + Object.entries(call.jsonKeys).map(([a, k]) => `${a}[${k.size}]`).join(', ') + ')' : ''}${f.anon_exec ? ' [note: anon also has EXECUTE]' : ''}`;
  });
}

// =============================================================================================
// Guard: everything textual was parsed
// =============================================================================================
// Documented helper internals: `table(name)` inside fleet.ts/finance.ts fetchAll (name is a parameter).
const HELPER_INTERNALS = 2;
await check('contract scanner: every .from()/table()/rpcAny() call site parsed', async () => {
  const parsedChains = sites.filter(s => s.label !== 'fetchAll').length;
  const textualChains = textual.from + textual.table;
  const problems = [];
  if (parsedChains + unresolved.filter(u => u.why.startsWith('table')).length !== textualChains) problems.push(`chains: textual ${textualChains}, parsed ${parsedChains}`);
  const unexpected = unresolved.filter(u => !(u.why === 'table name expression `name`' && ['fleet.ts', 'finance.ts'].includes(u.file)));
  if (unexpected.length) problems.push('unparsed: ' + unexpected.map(u => `${u.file}:${u.line} ${u.why}`).join('; '));
  if (unresolved.length - unexpected.length !== HELPER_INTERNALS) problems.push(`expected ${HELPER_INTERNALS} helper-internal sites, got ${unresolved.length - unexpected.length}`);
  if (rpcs.length !== textual.rpc) problems.push(`rpc: textual ${textual.rpc}, parsed ${rpcs.length}`);
  if (problems.length) throw new Error(problems.join(' | '));
  return `${sites.length} chains, ${rpcs.length} rpc calls, ${shapesByKey.size} distinct selects`;
});

// Every relation the services touch is tenant-safe through PostgREST: tables have RLS on,
// views run with the caller's rights (security_invoker) so they do not bypass that RLS.
await check('contract relations used by services: RLS on tables, security_invoker on views', async () => {
  const used = new Set();
  const walk = (s) => { used.add(s.table); s.embeds.forEach(e => walk(e.shape)); };
  shapesByKey.forEach(walk);
  sites.forEach(s => used.add(s.table));
  const bad = [];
  for (const name of used) {
    const r = (await q(`select c.relkind, c.relrowsecurity, coalesce(array_to_string(c.reloptions, ','), '') as opts
                        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = '${name}'`))[0];
    if (!r) continue;
    if (r.relkind === 'r' && !r.relrowsecurity) bad.push(`${name}: RLS disabled`);
    if (r.relkind === 'v' && !/security_invoker=(true|on)/.test(r.opts)) bad.push(`${name}: view without security_invoker (bypasses RLS)`);
  }
  if (bad.length) throw new Error(bad.join(' | '));
  return `${used.size} relations`;
});

// Self-test of the relationship resolver on a synthetic pair linked by two FKs (none exist in the
// schema today, so the ambiguity branch would otherwise never be exercised).
await check('contract resolver self-test: two FKs => ambiguous unless hinted', async () => {
  rels.set('zz_a', { kind: 'table', cols: new Map([['id', {}], ['x', {}], ['y', {}]]) });
  rels.set('zz_b', { kind: 'table', cols: new Map([['id', {}]]) });
  const added = [
    { conname: 'zz_a_x_fkey', src: 'zz_a', tgt: 'zz_b', src_cols: ['x'], tgt_cols: ['id'] },
    { conname: 'zz_a_y_fkey', src: 'zz_a', tgt: 'zz_b', src_cols: ['y'], tgt_cols: ['id'] },
  ];
  fks.push(...added);
  try {
    const run = (sel) => { const p = []; checkSelect('zz_a', parseSelect(sel), p); return p.join(' | '); };
    const amb = run('*, b:zz_b(id)'), byName = run('*, b:zz_b!zz_a_x_fkey(id)'), byCol = run('*, b:zz_b!y(id)');
    const reverse = (() => { const p = []; const s = checkSelect('zz_b', parseSelect('id, as:zz_a!x(id)'), p); return p.length ? p.join() : s.embeds[0].card; })();
    if (!amb.includes('ambiguous') || byName || byCol || reverse !== 'many') throw new Error(JSON.stringify({ amb, byName, byCol, reverse }));
    return 'ok';
  } finally {
    fks.splice(fks.length - added.length, added.length);
    rels.delete('zz_a'); rels.delete('zz_b');
  }
});

// =============================================================================================
// Part 2: mapper round trips (dynamic)
// =============================================================================================
let mods = null, tmp = null;
try {
  const { build } = await import('esbuild');
  tmp = mkdtempSync(join(tmpdir(), 'erp-contract-'));
  await build({
    entryPoints: files.map(f => join(SERVICES, f)),
    bundle: true, format: 'esm', platform: 'node', outdir: tmp, logLevel: 'silent', outExtension: { '.js': '.mjs' },
    plugins: [{
      name: 'stub-supabase',
      setup(b) {
        b.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase-stub', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: 'export const supabase = { auth: { getSession: async () => ({ data: { session: null } }) } };', loader: 'js',
        }));
      },
    }],
  });
  mods = {};
  for (const f of files) mods[f.replace(/\.ts$/, '')] = await import(pathToFileURL(join(tmp, f.replace(/\.ts$/, '.mjs'))).href);
} catch (e) {
  await check('contract mappers: bundle services with esbuild', async () => { throw e; });
}

const sampleValue = (c) => {
  if (!c) return 'x';
  if (c.type === 'ARRAY') return [];
  if (c.type === 'USER-DEFINED') return enums.get(c.udt) ?? 'x';
  if (c.udt === 'uuid') return '00000000-0000-0000-0000-000000000001';
  if (c.udt === 'numeric') return '1.5';
  if (['int2', 'int4', 'int8', 'float4', 'float8'].includes(c.udt)) return 1;
  if (c.udt === 'bool') return true;
  if (c.udt === 'date') return '2026-01-15';
  if (c.udt === 'timestamptz' || c.udt === 'timestamp') return '2026-01-15T10:00:00+00:00';
  if (c.udt === 'time') return '10:00:00';
  if (c.udt === 'jsonb' || c.udt === 'json') return {};
  return 'x';
};
const NOT_FIELDS = new Set(['then', 'toJSON', 'constructor', '$$typeof', 'valueOf', 'toString', 'length', 'asymmetricMatch', 'nodeType']);
function synth(shape, misses, path) {
  const rel = rels.get(shape.table);
  const obj = {};
  if (rel) {
    if (shape.star) for (const [c, info] of rel.cols) obj[c] = sampleValue(info);
    for (const { col, alias } of shape.cols) obj[alias] = sampleValue(rel.cols.get(col));
  }
  for (const e of shape.embeds) {
    const child = synth(e.shape, misses, `${path}.${e.alias}`);
    obj[e.alias] = e.card === 'many' ? [child] : child;
  }
  return new Proxy(obj, {
    get(target, k) {
      if (typeof k === 'string' && !(k in target) && !NOT_FIELDS.has(k)) misses.add(`${path}.${k}`);
      return target[k];
    },
  });
}

// mapper -> (table, select const or literal) pairing, taken from the fetchers/mutations that call them
const MAPPERS = [
  ['fleet', 'rowToCompany', 'companies', '*'],
  ['fleet', 'rowToVehicle', 'vehicles', 'VEHICLE_SELECT'],
  ['fleet', 'rowToTimeline', 'vehicle_timeline', '*'],
  ['fleet', 'rowToMaintenance', 'maintenance_records', 'MAINTENANCE_SELECT'],
  ['fleet', 'rowToWorkOrder', 'work_orders', 'WORK_ORDER_SELECT'],
  ['fleet', 'rowToOilChange', 'oil_changes', 'OIL_SELECT'],
  ['fleet', 'rowToTyre', 'tyres', 'TYRE_SELECT'],
  ['fleet', 'rowToTyreEvent', 'tyre_events', 'TYRE_EVENT_SELECT'],
  ['fleet', 'rowToAccident', 'accidents', 'ACCIDENT_SELECT'],
  ['fleet', 'rowToExpense', 'expenses', 'EXPENSE_SELECT'],
  ['finance', 'rowToSupplier', 'suppliers', '*', ['v_party_summary', '*']],
  ['finance', 'rowToCustomer', 'customers', '*', ['v_party_summary', '*']],
  ['finance', 'rowToInvoice', 'invoices', 'INVOICE_SELECT'],
  ['finance', 'rowToPayment', 'payments', 'PAYMENT_SELECT'],
  ['finance', 'rowToReconciliation', 'reconciliations', 'REC_SELECT'],
  ['accounting', 'rowToJournalEntry', 'journal_entries', 'JE_SELECT'],
  ['accounting', 'rowToFixedAsset', 'fixed_assets', 'FA_SELECT'],
  ['accounting', 'rowToDepreciationRun', 'depreciation_runs', 'DEP_SELECT'],
  ['hr', 'rowToEmployee', 'employees', 'EMP_SELECT'],
  ['hr', 'rowToPayrollRun', 'payroll_runs', 'PR_SELECT'],
  ['system', 'rowToNotification', 'notifications', "'*, notification_reads(read_at)'"],
  ['system', 'rowToApprovalRule', 'approval_rules', '*'],
  ['system', 'rowToApprovalRequest', 'approval_requests', "'*, approval_actions(*)'"],
  ['system', 'rowToAuditLog', 'audit_logs', '*'],
  ['documents', 'rowToDocument', 'documents', 'SELECT'],
  ['auth', 'profileToUser', 'profiles', '*'],
];
if (mods) {
  for (const [mod, fn, tbl, selExpr, second] of MAPPERS) {
    await check(`contract mapper ${mod}.${fn} <- ${tbl} ${selExpr}`, async () => {
      const mapper = mods[mod][fn];
      if (typeof mapper !== 'function') throw new Error(`${mod}.${fn} is not exported`);
      const sel = selExpr === '*' ? '*' : evalStr(selExpr, consts[`${mod}.ts`]);
      if (sel == null) throw new Error(`select ${selExpr} not found in ${mod}.ts`);
      // the pairing must be a select the service really issues
      if (!shapesByKey.has(`${tbl}|${sel}`)) throw new Error(`service never selects ${tbl} with "${sel}" - mapper pairing is stale`);
      const probs = [];
      const shape = checkSelect(tbl, parseSelect(sel), probs);
      const misses = new Set();
      const row = synth(shape, misses, tbl);
      const extra = second ? synth(checkSelect(second[0], parseSelect(second[1]), probs), misses, second[0]) : undefined;
      mapper(row, extra);
      if (misses.size) throw new Error(`mapper reads fields the select does not return: ${[...misses].join(', ')}`);
      return 'ok';
    });
  }
}

// Inline mappers (inside fetch functions): `<var>.<field>` reads must be columns of the relation.
const INLINE = [
  ['accounting.ts', 'fetchChartOfAccounts', 'a', 'accounts'],
  ['accounting.ts', 'fetchChartOfAccounts', 'b', 'v_account_balances'],
  ['finance.ts', 'fetchBankAccounts', 'r', 'bank_accounts'],
  ['finance.ts', 'fetchBankAccounts', 'b', 'v_bank_balances'],
  ['finance.ts', 'partySummaries', 'r', 'v_party_summary'],
  ['system.ts', 'fetchInvoiceAging', 'r', 'v_invoice_aging'],
  ['auth.ts', 'fetchMemberships', 'r', 'company_members'],
  ['auth.ts', 'fetchRolePermissions', 'r', 'role_permissions'],
  ['auth.ts', 'fetchApprovalLimits', 'r', 'approval_limits'],
];
for (const [file, fn, v, tbl] of INLINE) {
  await check(`contract inline mapper ${file}:${fn} ${v}.* <- ${tbl}`, async () => {
    const body = functionBody(srcs[file], fn);
    if (!body) throw new Error(`function ${fn} not found`);
    const cols = rels.get(tbl)?.cols;
    if (!cols) throw new Error(`relation ${tbl} does not exist`);
    const used = new Set([...body.text.matchAll(new RegExp(`(?<![\\w.])${v}\\??\\.(\\w+)`, 'g'))].map(m => m[1]));
    const bad = [...used].filter(c => !cols.has(c) && !['map', 'filter', 'length'].includes(c));
    if (bad.length) throw new Error(`reads ${bad.map(c => `${v}.${c}`).join(', ')} not on ${tbl}`);
    return [...used].join(', ');
  });
}
// Fields of finance.ts PartySummary (2nd arg of rowToSupplier/rowToCustomer) must exist on v_party_summary.
await check('contract finance.ts PartySummary fields exist on v_party_summary', async () => {
  const m = srcs['finance.ts'].match(/interface PartySummary \{([^}]*)\}/);
  const fields = [...m[1].matchAll(/(\w+):/g)].map(x => x[1]);
  const bad = fields.filter(f => !rels.get('v_party_summary').cols.has(f));
  if (bad.length) throw new Error('missing: ' + bad.join(', '));
  return fields.join(', ');
});

if (tmp) try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
t.report();
