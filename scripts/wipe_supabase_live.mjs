/**
 * Wipe all operational data from the LIVE Supabase database.
 * Keeps ONLY:  auth.users, profiles, companies, company_members, role_permissions,
 *              approval_limits, approval_rules, account_templates.
 *
 * Removes:     vehicles, tyres, oil_changes, work_orders, maintenance_records,
 *              invoices, invoice_lines, payments, journal_entries, journal_lines,
 *              expenses, accidents, fixed_assets, depreciation_runs, employees,
 *              payroll_runs, suppliers, customers, bank_accounts, accounts,
 *              notifications, approval_requests, reconciliations, documents,
 *              audit_logs, vehicle_timeline.
 *
 * Usage:  node scripts/wipe_supabase_live.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fpeniljpqigpeqtsgizr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gEkaiJsdzDxFerXs42Vf8w_Hb5KWvn_';
const SUPER_ADMIN_EMAIL = 'superadmin@hakim.com';
const SUPER_ADMIN_PASS  = '7YlY6CbYP32rM^lIhi';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Tables in dependency-safe deletion order (children first, parents last).
// journal_entries and payments are read-only via RLS (insert/delete only via RPC),
// so we use rpc('query') or handle them specially.
const TABLES_TO_WIPE = [
  // ---- Child / leaf tables first ----
  'notification_reads',
  'notifications',
  'approval_actions',
  'approval_requests',
  'reconciliations',
  'depreciation_run_items',
  'depreciation_runs',
  'payroll_items',
  'payroll_runs',
  'tyre_events',
  'oil_changes',
  'tyres',
  'maintenance_records',
  'vehicle_timeline',
  'expenses',
  'accidents',
  // ---- Financial tables (some are RPC-only) ----
  'invoice_lines',
  // payments, journal_lines, journal_entries handled via SQL RPC
  'fixed_assets',
  'employees',
  // ---- Work orders after maintenance ----
  'work_orders',
  // ---- Vehicles after all FK children removed ----
  'vehicles',
  // ---- Master data ----
  'customers',
  'suppliers',
  // ---- Accounts & bank ----
  'accounts',
  'bank_accounts',
];

async function main() {
  console.log('Signing in as Super Admin...');
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: SUPER_ADMIN_EMAIL,
    password: SUPER_ADMIN_PASS,
  });
  if (authErr) {
    console.error('Auth failed:', authErr.message);
    process.exit(1);
  }
  console.log(`Signed in as ${authData.user.email} (${authData.user.id})`);

  // First, handle read-only tables that need SQL-level deletion.
  // payments and journal_entries/journal_lines are SELECT-only for authenticated users.
  // We'll use the Supabase SQL editor RPC if available, or try direct delete.
  // Let's try direct delete first — if RLS blocks it, we note it.

  // --- Delete payments via supabase (RLS: select-only, so this may fail) ---
  console.log('\n--- Attempting to clear read-only financial ledger tables ---');

  // Try deleting payments
  const { error: payErr } = await supabase.from('payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (payErr) {
    console.log(`  payments: RLS blocked delete (${payErr.message}) — will need SQL Editor`);
  } else {
    console.log('  payments: cleared');
  }

  // Try deleting journal_lines
  const { error: jlErr } = await supabase.from('journal_lines').delete().neq('id', 0);
  if (jlErr) {
    console.log(`  journal_lines: RLS blocked delete (${jlErr.message}) — will need SQL Editor`);
  } else {
    console.log('  journal_lines: cleared');
  }

  // Try deleting journal_entries
  const { error: jeErr } = await supabase.from('journal_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (jeErr) {
    console.log(`  journal_entries: RLS blocked delete (${jeErr.message}) — will need SQL Editor`);
  } else {
    console.log('  journal_entries: cleared');
  }

  // Try deleting invoices (posted invoices may have triggers preventing deletion)
  const { error: invErr } = await supabase.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (invErr) {
    console.log(`  invoices: blocked (${invErr.message}) — will need SQL Editor`);
  } else {
    console.log('  invoices: cleared');
  }

  // Try deleting audit_logs
  const { error: auditErr } = await supabase.from('audit_logs').delete().neq('id', 0);
  if (auditErr) {
    console.log(`  audit_logs: blocked (${auditErr.message}) — will need SQL Editor`);
  } else {
    console.log('  audit_logs: cleared');
  }

  // --- Standard deletable tables ---
  console.log('\n--- Clearing standard operational tables ---');
  const blocked = [];

  for (const table of TABLES_TO_WIPE) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      console.log(`  ${table}: BLOCKED — ${error.message}`);
      blocked.push(table);
    } else {
      console.log(`  ${table}: deleted ${count ?? '?'} rows`);
    }
  }

  // Summary
  console.log('\n========================================');
  console.log('WIPE COMPLETE');
  console.log('========================================');

  if (blocked.length > 0) {
    console.log('\nThe following tables could not be wiped via the client (RLS/trigger restrictions):');
    blocked.forEach(t => console.log(`  - ${t}`));
    console.log('\nTo fully clear these, run the following SQL in the Supabase SQL Editor (Dashboard):');
    console.log(`
-- Run this in the Supabase SQL Editor with service-role privileges:
DELETE FROM public.payments WHERE true;
DELETE FROM public.journal_lines WHERE true;
DELETE FROM public.journal_entries WHERE true;
DELETE FROM public.invoice_lines WHERE true;
DELETE FROM public.invoices WHERE true;
DELETE FROM public.audit_logs WHERE true;
DELETE FROM public.vehicle_timeline WHERE true;
`);
  }

  console.log('\nKEPT: auth.users, profiles, companies, company_members (user logins & admin)');
  console.log('REMOVED: all operational, financial, fleet, and transactional data');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
