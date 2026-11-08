import { setup } from '../supabase/tests/harness.mjs';
import { writeFileSync } from 'fs';

export const FRESH_SEED_SQL = `
-- =====================================================================
-- FLEETX ERP - PRODUCTION FRESH RESET (USER LOGINS ONLY)
-- Keeps ONLY:
--   1. Regional Offices / Companies (Muscat HO, Duqm, Salalah)
--   2. User Accounts & Profiles (Super Admin, Fleet Manager, Accountant, etc.)
--
-- REMOVES EVERYTHING ELSE:
--   - Chart of Accounts, Bank Accounts, Suppliers, Customers
--   - Vehicles, Tyres, Work Orders, Maintenance, Oil Changes
--   - Invoices, Payments, Journal Entries, P&L data
--   - Fixed Assets, Depreciation, Employees, Payroll
--   - Expenses, Accidents, Notifications, Audit Logs
-- =====================================================================

-- 1. PURGE ALL DATA (in dependency-safe order)
truncate table
  public.reconciliations,
  public.payments,
  public.journal_lines,
  public.journal_entries,
  public.invoice_lines,
  public.invoices,
  public.approval_actions,
  public.approval_requests,
  public.notification_reads,
  public.notifications,
  public.depreciation_run_items,
  public.depreciation_runs,
  public.fixed_assets,
  public.payroll_items,
  public.payroll_runs,
  public.employees,
  public.tyre_events,
  public.oil_changes,
  public.tyres,
  public.maintenance_records,
  public.vehicle_timeline,
  public.expenses,
  public.accidents,
  public.work_orders,
  public.vehicles,
  public.customers,
  public.suppliers,
  public.accounts,
  public.bank_accounts,
  public.audit_logs
restart identity cascade;

-- 2. COMPANIES & REGIONAL OFFICES
insert into public.companies (id, legacy_id, name, code, vat_number, country, city, currency)
values
  ('11111111-1111-1111-1111-111111111111', 'comp-1', 'Al Hakim National LLC - Head Office', 'AHN-HO',  'OM1100482910', 'Oman', 'Muscat', 'OMR'),
  ('22222222-2222-2222-2222-222222222222', 'comp-2', 'Al Hakim National LLC - Duqm Office', 'AHN-DQM', 'OM1100482910', 'Oman', 'Duqm',   'OMR'),
  ('33333333-3333-3333-3333-333333333333', 'comp-3', 'Al Hakim National LLC - Salalah Branch', 'AHN-SLL', 'OM1100482910', 'Oman', 'Salalah', 'OMR')
on conflict (id) do nothing;

-- 3. AUTH USERS & PROFILES (Password: 7YlY6CbYP32rM^lIhi)
do $users_seed$
declare
  u record;
begin
  for u in select * from (values
      ('00000000-0000-0000-0000-000000000001'::uuid, 'superadmin@hakim.com', 'Faisal Al-Hakim', 'Super Admin', 'Executive Management', null::text[]),
      ('00000000-0000-0000-0000-000000000002'::uuid, 'admin@hakim.com', 'Salim Al-Busaidi', 'Company Admin', 'Administration', array['comp-1','comp-2','comp-3']),
      ('00000000-0000-0000-0000-000000000003'::uuid, 'fleetmanager@hakim.com', 'Hamad Al-Riyami', 'Fleet Manager', 'Fleet Operations', array['comp-1','comp-2']),
      ('00000000-0000-0000-0000-000000000004'::uuid, 'maintenance@hakim.com', 'Khamis Al-Shehhi', 'Maintenance Manager', 'Workshop & Maintenance', array['comp-1','comp-2']),
      ('00000000-0000-0000-0000-000000000005'::uuid, 'accounts@hakim.com', 'Mariam Al-Hinai', 'Accountant', 'Finance & Accounts', array['comp-1','comp-2']),
      ('00000000-0000-0000-0000-000000000006'::uuid, 'accountmanager@hakim.com', 'Said Al-Habsi', 'Finance Manager', 'Finance & Treasury', array['comp-1','comp-2','comp-3']),
      ('00000000-0000-0000-0000-000000000007'::uuid, 'procurement@hakim.com', 'Ahmed Al-Rawahi', 'Procurement', 'Supply Chain', array['comp-1']),
      ('00000000-0000-0000-0000-000000000008'::uuid, 'management@hakim.com', 'Nasser Al-Maawali', 'Management', 'Board of Directors', array['comp-1','comp-2','comp-3']),
      ('00000000-0000-0000-0000-000000000009'::uuid, 'viewer@hakim.com', 'Aisha Al-Ghafri', 'Viewer', 'Auditing & Compliance', array['comp-1'])
    ) as t(id, email, name, role, department, companies)
  loop
    if not exists (select 1 from auth.users where id = u.id) then
      insert into auth.users (id, email) values (u.id, u.email);
    end if;

    insert into public.profiles (id, name, email) values (u.id, u.name, u.email)
    on conflict (id) do update set name = excluded.name, email = excluded.email;

    update public.profiles
    set role = u.role::public.user_role, department = u.department, status = 'active'
    where id = u.id;

    if u.companies is not null then
      insert into public.company_members (user_id, company_id)
      select u.id, c.id from public.companies c where c.legacy_id = any(u.companies)
      on conflict do nothing;
    end if;
  end loop;
end $users_seed$;

-- 4. REMOVE AUTO-SEEDED CHART OF ACCOUNTS (created by migration triggers)
delete from public.accounts;
delete from public.bank_accounts;
`;

async function run() {
  const t = await setup('supabase/migrations', { quiet: true });
  console.log('Testing fresh user-logins-only seed SQL on PGlite...');
  await t.db.exec(FRESH_SEED_SQL);
  console.log('Seed executed successfully!');

  // Verify everything is empty except users/companies
  const tables = [
    'companies', 'profiles', 'company_members',
    'bank_accounts', 'accounts',
    'suppliers', 'customers',
    'vehicles', 'tyres', 'oil_changes',
    'work_orders', 'maintenance_records',
    'invoices', 'invoice_lines', 'payments',
    'journal_entries',
    'fixed_assets', 'employees',
    'expenses', 'accidents', 'notifications'
  ];
  const summary = {};
  for (const tbl of tables) {
    const res = await t.db.query('select count(*) as c from public.' + tbl);
    summary[tbl] = Number(res.rows[0].c);
  }
  console.log('Database record counts:', summary);
  writeFileSync('supabase/seed.sql', FRESH_SEED_SQL, 'utf8');
  console.log('Updated supabase/seed.sql');
}

run().catch(err => {
  console.error('Seed execution error:', err);
  process.exit(1);
});
