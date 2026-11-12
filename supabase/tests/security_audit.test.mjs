// Security audit over the whole schema after every migration (Phase 6):
// * RLS is enabled on every table in public;
// * anon has no table, view or function access in public (nothing beyond sign-in);
// * every SECURITY DEFINER function pins search_path;
// * every SECURITY DEFINER function executable by `authenticated` checks permissions
//   (perm_company_ids / has_perm / can_in / is_super_admin / auth.uid() / an explicit
//   "Permission denied"), unless it is on the allow-list below with a reason.
// Standalone: node supabase/tests/security_audit.test.mjs supabase/migrations
import { setup } from './harness.mjs';

const t = await setup(process.argv[2] || 'supabase/migrations', { quiet: true });
const { check, asServer, assert } = t;

// Definer functions that are safe for any signed-in user without a further check, and why.
const SAFE_DEFINER = {
  is_super_admin: 'answers for the caller only',
  app_role: 'answers for the caller only',
  current_role_id: 'answers for the caller only',
  has_perm: 'answers for the caller only',
  perm_company_ids: 'answers for the caller only',
  can_in: 'answers for the caller only',
  has_company_access: 'answers for the caller only',
  user_company_ids: 'answers for the caller only',
  shares_company_with: 'answers for the caller only',
  storage_company: 'maps a storage path to its office id',
  ledger_company_ids: 'answers for the caller only',
  org_id: 'the single organization id (not secret)',
  office_setting: 'one setting value of an office (settings, not business data)',
  doc_prefix: 'document number prefix (format settings only)',
  doc_pad: 'document number padding (format settings only)',
  validate_custom_fields: 'validates and cleans the values passed in; reads field definitions only',
  setup_checklist: 'yes/no per setup step, no data',
  party_office_ids: 'offices a party is shared with (ids only); used by RLS policies',
  period_is_closed: 'yes/no for one office and month; used by posting guards',
};
const PERM_TOKENS = /perm_company_ids|has_perm|can_in\(|is_super_admin|auth\.uid\(\)|Permission denied|has_company_access|user_company_ids|can_approve|ledger_company_ids|_require_[a-z_]*\(|statement_only_company_ids/i;

const fns = (await asServer(`
  select p.proname name, pg_get_function_identity_arguments(p.oid) args, p.prosecdef definer, p.proconfig config, p.prosrc src,
         has_function_privilege('authenticated', p.oid, 'execute') auth_exec,
         has_function_privilege('anon', p.oid, 'execute') anon_exec,
         p.prorettype = 'trigger'::regtype is_trigger
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`)).rows;

await check('RLS is enabled on every table in public', async () => {
  const r = (await asServer(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1`)).rows;
  assert(r.length === 0, 'without RLS: ' + r.map(x => x.relname).join(', '));
  return 'ok';
});
await check('anon has no table or view privileges in public', async () => {
  const r = (await asServer(`select table_name, string_agg(privilege_type, ',') p from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public' group by 1 order by 1`)).rows;
  assert(r.length === 0, r.map(x => `${x.table_name}(${x.p})`).join(', ')); return 'none';
});
await check('anon can execute no function in public (triggers aside)', async () => {
  const bad = fns.filter(f => f.anon_exec && !f.is_trigger);
  assert(bad.length === 0, bad.map(f => `${f.name}(${f.args})`).join(', ')); return 'none';
});
await check('every SECURITY DEFINER function sets search_path', async () => {
  const bad = fns.filter(f => f.definer && !(f.config ?? []).some(c => c.startsWith('search_path=')));
  assert(bad.length === 0, bad.map(f => f.name).join(', ')); return `${fns.filter(f => f.definer).length} definer functions`;
});
await check('every SECURITY DEFINER function callable by authenticated checks permissions', async () => {
  const bad = fns.filter(f => f.definer && f.auth_exec && !f.is_trigger && !SAFE_DEFINER[f.name] && !PERM_TOKENS.test(f.src ?? ''));
  if (bad.length) console.error('UNCHECKED DEFINER:', [...new Set(bad.map(f => f.name))].join(' '));
  assert(bad.length === 0, bad.map(f => f.name).join(', '));
  return `${fns.filter(f => f.definer && f.auth_exec && !f.is_trigger).length} checked`;
});

// Fixes from 20261113003000_security_hardening.sql
import { seedFixtures, IDS } from './harness.mjs';
await seedFixtures(t.db);
await check('preview_doc_number: refused for an office the user cannot access', async () => {
  const r = (await t.as(IDS.OTHER, `select preview_doc_number('sales_invoice', '${IDS.HO}') n`)).rows[0].n;
  assert(r === null, r); const own = (await t.as(IDS.FLEET, `select preview_doc_number('sales_invoice', '${IDS.HO}') n`)).rows[0].n;
  assert(own && own.startsWith('INV'), 'own office ' + own);
  return `other office: null, own office: ${own}`;
});
await check('budget_total runs as the caller', async () => {
  const r = (await asServer(`select prosecdef from pg_proc where proname = 'budget_total'`)).rows[0];
  assert(r.prosecdef === false, 'still definer'); return 'invoker';
});

t.report();
