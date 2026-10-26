// Shared PGlite test harness for supabase/tests/*.test.mjs
//
// Usage in a test file (supabase/tests/<slot>.test.mjs):
//   import { setup, seedFixtures, IDS } from './harness.mjs';
//   const t = await setup(process.argv[2]);          // fresh DB with every migration applied
//   await seedFixtures(t.db);                         // optional: the standard users/companies below
//   await t.check('name', async () => { ... }, expectedErrorSubstringOrTrue?);
//   await t.as(IDS.ADMIN, 'select ...');              // one statement as an authenticated user
//   await t.tx(IDS.ADMIN, 'insert ...; select ...');  // a transaction as that user (deferred triggers fire)
//   await t.asServer('select ...');                   // owner/service context: auth.uid() is null
//   t.report();                                       // prints results and exits 1 on any failure
//
// Every *.test.mjs file runs in its own process with its own in-memory database, so
// files are independent. `npm run test:db` runs schema.test.mjs, which runs the others.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Minimal Supabase stand-ins. The default privileges mirror a hosted Supabase project:
// objects that `postgres` creates in `public` are granted to anon/authenticated
// automatically unless a migration revokes them (this is what the advisors flag).
export const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export const IDS = {
  ADMIN: '00000000-0000-0000-0000-00000000000a',   // Super Admin
  VIEWER: '00000000-0000-0000-0000-00000000000b',  // Viewer, member of HO
  FLEET: '00000000-0000-0000-0000-00000000000c',   // Fleet Manager, member of HO
  OTHER: '00000000-0000-0000-0000-00000000000d',   // Fleet Manager, member of DQ
  HO: '11111111-1111-1111-1111-111111111111',
  DQ: '22222222-2222-2222-2222-222222222222',
};

// opts.order(files) may reorder the sorted migration list (e.g. to replay the linked
// project's apply order); opts.quiet suppresses the per-migration OK lines.
export async function setup(dir = 'supabase/migrations', opts = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  let files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  if (opts.order) files = opts.order(files);
  for (const f of files) {
    try { await db.exec(readFileSync(join(dir, f), 'utf8')); if (!opts.quiet) console.log('OK   migration', f); }
    catch (e) { console.log('FAIL migration', f, '\n  ', e.message); process.exit(1); }
  }

  const results = [];
  const check = async (name, fn, expectError) => {
    try {
      const r = await fn();
      results.push([expectError ? 'FAIL' : 'PASS', name, expectError ? 'expected error, got success' : (r ?? '')]);
    } catch (e) {
      const ok = expectError && (expectError === true || e.message.includes(expectError));
      results.push([ok ? 'PASS' : 'FAIL', name, e.message]);
    }
  };
  const setUid = (uid) => `select set_config('request.uid', '${uid ?? ''}', false);`;
  // one statement as an authenticated user
  const as = async (uid, sql, params) => {
    await db.exec(`set role authenticated; ${setUid(uid)}`);
    try { return await db.query(sql, params); } finally { await db.exec(`reset role; ${setUid(null)}`); }
  };
  // a transaction as an authenticated user, so deferred constraint triggers fire at commit
  const tx = async (uid, sql) => {
    await db.exec(`set role authenticated; ${setUid(uid)}`);
    try { await db.exec(`begin; ${sql}; commit;`); }
    catch (e) { await db.exec('rollback'); throw e; }
    finally { await db.exec(`reset role; ${setUid(null)}`); }
  };
  // owner / service-role context (auth.uid() is null), e.g. imports and SQL editor
  // (several statements allowed when no params; returns the last statement's result)
  const asServer = async (sql, params) => {
    await db.exec(setUid(null));
    if (params) return db.query(sql, params);
    const res = await db.exec(sql); return res[res.length - 1];
  };
  const one = async (uid, sql) => (await as(uid, sql)).rows[0];
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  const report = () => {
    for (const [s, n, d] of results) console.log(s.padEnd(5), n, d ? '— ' + String(d).slice(0, 160) : '');
    const fails = results.filter(r => r[0] === 'FAIL').length;
    console.log(`\n${results.length - fails}/${results.length} passed`);
    process.exit(fails ? 1 : 0);
  };
  return { db, results, check, as, tx, asServer, one, assert, report };
}

// Standard fixtures used by schema.test.mjs (call once on a fresh DB).
// Inserted as owner with auth.uid() null, so no creator membership is added.
export async function seedFixtures(db) {
  const { ADMIN, VIEWER, FLEET, OTHER, HO, DQ } = IDS;
  await db.exec(`
    select set_config('request.uid', '', false);
    insert into auth.users (id, email) values ('${ADMIN}','a@x'),('${VIEWER}','v@x'),('${FLEET}','f@x'),('${OTHER}','o@x');
    update public.profiles set role = 'Super Admin' where id = '${ADMIN}';
    update public.profiles set role = 'Viewer' where id = '${VIEWER}';
    update public.profiles set role = 'Fleet Manager' where id in ('${FLEET}','${OTHER}');
    insert into public.companies (id, name, code) values ('${HO}','Head Office','HO'), ('${DQ}','Duqm','DQ');
    insert into public.company_members values ('${VIEWER}','${HO}'), ('${FLEET}','${HO}'), ('${OTHER}','${DQ}');
    insert into public.accounts (company_id, code, name, category, subcategory) values
      ('${HO}','1010','Bank','Asset','Cash'), ('${HO}','1100','AR','Asset','Receivables'),
      ('${HO}','1300','Input VAT','Asset','Tax'), ('${HO}','2010','AP','Liability','Payables'),
      ('${HO}','2100','Output VAT','Liability','Tax'), ('${HO}','5000','Maintenance','Expense','Direct')
    on conflict (company_id, code) do nothing;
    insert into public.suppliers (id, supplier_code, name, supplier_type) values ('33333333-3333-3333-3333-333333333333','SUP-001','Zubair','Garage');
    insert into public.bank_accounts (id, company_id, bank_name, account_name, account_number, account_type)
      values ('44444444-4444-4444-4444-444444444444','${HO}','BM','Ops','001','Current');
    insert into public.vehicles (id, company_id, vehicle_code, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission)
      values ('55555555-5555-5555-5555-555555555555','${HO}','VH-001','1234 AB','SUV','Operations','Toyota','LC','Diesel','Automatic');
  `);
}
