import { setup } from '../supabase/tests/harness.mjs';
import { writeFileSync } from 'fs';

export const FRESH_ACCOUNTS_SEED_SQL = `
-- =====================================================================
-- FLEETX ERP - PRODUCTION FRESH RESET (ACCOUNTS ONLY)
-- Only System Accounts retained:
--   1. Regional Offices / Companies (Muscat HO, Duqm, Salalah)
--   2. User Accounts & Profiles (Super Admin, Fleet Manager, Accountant, etc.)
--   3. Chart of Accounts (COA: Assets, Liabilities, Equity, Revenue, Expenses)
--   4. Bank Accounts (Bank Muscat, Bank Dhofar, National Bank of Oman)
--
-- All operational/demo records (vehicles, tyres, work orders, maintenance,
-- invoices, payments, expenses, accidents, employees, suppliers, customers)
-- are completely clean with zero data.
-- =====================================================================

-- 1. PURGE ALL OPERATIONAL & TRANSACTIONAL RECORDS
truncate table
  public.reconciliations,
  public.payments,
  public.invoice_lines,
  public.invoices,
  public.maintenance_records,
  public.work_orders,
  public.oil_changes,
  public.tyre_events,
  public.tyres,
  public.accidents,
  public.expenses,
  public.vehicles,
  public.depreciation_runs,
  public.fixed_assets,
  public.payroll_items,
  public.payroll_runs,
  public.employees,
  public.customers,
  public.suppliers,
  public.notifications,
  public.notification_reads,
  public.approval_actions,
  public.approval_requests
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

-- 4. BANK ACCOUNTS
insert into public.bank_accounts (id, company_id, bank_name, account_name, account_number, iban, currency, account_type, opening_balance, active)
values
  ('bbbbbbbb-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Bank Muscat SAOG', 'Main Corporate Operational Account', '0315-0048-2910-0001', 'OM64BMUS0315004829100001', 'OMR', 'Current', 45000.000, true),
  ('bbbbbbbb-0002-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Bank Dhofar SAOG', 'Duqm Regional Port Operations', '0108-9923-4410-0002', 'OM71BDOF0108992344100002', 'OMR', 'Current', 18500.000, true),
  ('bbbbbbbb-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'National Bank of Oman', 'Fleet Payroll & Allowances Pool', '1002-8834-5501-0003', 'OM55NBOM1002883455010003', 'OMR', 'Current', 12000.000, true)
on conflict (id) do nothing;

-- 5. CHART OF ACCOUNTS (COA) INITIALIZATION
-- Ensures full chart of accounts exists for all regional entities
select public._seed_chart_of_accounts(id) from public.companies;
`;

async function run() {
  const t = await setup('supabase/migrations', { quiet: true });
  console.log('Testing fresh accounts-only seed SQL on PGlite...');
  await t.db.exec(FRESH_ACCOUNTS_SEED_SQL);
  console.log('Fresh accounts seed executed successfully without errors!');

  // Check counts
  const tables = [
    'companies',
    'profiles',
    'bank_accounts',
    'accounts',
    'suppliers',
    'customers',
    'vehicles',
    'tyres',
    'oil_changes',
    'work_orders',
    'maintenance_records',
    'invoices',
    'invoice_lines',
    'payments',
    'fixed_assets',
    'employees',
    'expenses',
    'accidents',
    'notifications'
  ];
  const summary = {};
  for (const tbl of tables) {
    const res = await t.db.query('select count(*) as c from public.' + tbl);
    summary[tbl] = Number(res.rows[0].c);
  }
  console.log('Fresh Database Record Counts (Accounts Only):', summary);
  writeFileSync('supabase/seed.sql', FRESH_ACCOUNTS_SEED_SQL, 'utf8');
  console.log('Updated supabase/seed.sql successfully');
}

run().catch(err => {
  console.error('Seed execution error:', err);
  process.exit(1);
});
