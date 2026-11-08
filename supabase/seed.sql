
-- =====================================================================
-- FLEETX ERP - PRODUCTION FRESH RESET WITH VEHICLE DETAILS
-- Keeps:
--   1. Regional Offices / Companies (Muscat HO, Duqm, Salalah)
--   2. User Accounts & Profiles (Super Admin, Fleet Manager, Accountant, etc.)
--   3. Detailed Vehicles Fleet (Commercial fleet with complete specs)
--
-- REMOVES:
--   - Chart of Accounts, Bank Accounts, Suppliers, Customers
--   - Invoices, Payments, Journal Entries, P&L data
--   - Fixed Assets, Depreciation, Employees, Payroll
--   - Expenses, Accidents, Notifications, Audit Logs
-- =====================================================================

-- 1. PURGE ALL OPERATIONAL DATA
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

-- 4. VEHICLES WITH FULL SPECIFICATIONS & DETAILS
insert into public.vehicles (
  id, company_id, vehicle_code, plate_number, registration_number, vin, engine_number,
  vehicle_type, vehicle_category, brand, manufacturer, model, variant,
  manufacturing_year, registration_date, registration_expiry_date, country_of_registration,
  color, fuel_type, transmission, engine_capacity_cc, number_of_seats,
  current_mileage, initial_odometer, status,
  assigned_driver, department, location,
  insurance_provider, insurance_policy_number, insurance_expiry_date, insurance_premium_annual,
  current_market_value, purchase, depreciation, oil_config
)
values
  -- Vehicle 1: Toyota Land Cruiser GXR V6
  ('eeeeeeee-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'VH-001', '1042-A', 'ROP-REG-88210', 'JTEBU71J8M4091283', '1GR-FE-99214',
   'SUV', 'Operations', 'Toyota', 'Toyota Motor Corporation', 'Land Cruiser', 'GXR 4.0L V6',
   2024, '2024-01-15', '2027-01-14', 'Oman',
   'Super White', 'Petrol', 'Automatic', 3956, 7,
   34200, 0, 'Active',
   'Salem Al-Mamari', 'Field Operations', 'Muscat HQ Yard',
   'Dhofar Insurance Company SAOG', 'POL-DH-2024-88192', '2027-01-14', 480.000,
   22000.000,
   '{"purchaseDate":"2024-01-15","purchaseValue":24500,"vendor":"Zubair Automotive LLC"}'::jsonb,
   '{"purchaseValue":24500,"salvageValue":5000,"usefulLifeYears":5,"depreciationMethod":"Straight-Line","annualDepreciationRate":20}'::jsonb,
   '{"serviceIntervalKm":10000,"recommendedOilGrade":"5W-30","oilCapacityLitres":6.8}'::jsonb),

  -- Vehicle 2: Isuzu D-Max Double Cab 4x4
  ('eeeeeeee-0002-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'VH-002', '8821-B', 'ROP-REG-44109', 'MP1TFS85JNT094812', '4JJ3-TCX-8812',
   'Pickup', 'Operations', 'Isuzu', 'Isuzu Motors Ltd', 'D-Max', '3.0L Double Cab LS',
   2023, '2023-03-20', '2026-03-19', 'Oman',
   'Titanium Silver', 'Diesel', 'Manual', 2999, 5,
   58400, 0, 'Active',
   'Rashid Al-Harthy', 'Field Operations', 'Duqm Regional Yard',
   'Oman United Insurance SAOG', 'OUI-DMX-2023-4100', '2026-03-19', 320.000,
   10500.000,
   '{"purchaseDate":"2023-03-20","purchaseValue":12800,"vendor":"Zubair Automotive LLC"}'::jsonb,
   '{"purchaseValue":12800,"salvageValue":2500,"usefulLifeYears":5,"depreciationMethod":"Straight-Line","annualDepreciationRate":20}'::jsonb,
   '{"serviceIntervalKm":10000,"recommendedOilGrade":"15W-40","oilCapacityLitres":8.5}'::jsonb),

  -- Vehicle 3: Mercedes-Benz Actros Prime Mover
  ('eeeeeeee-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'VH-003', '5519-C', 'ROP-REG-11928', 'WDB9340322L849102', 'OM501LA-4491',
   'Truck', 'Logistics', 'Mercedes-Benz', 'Daimler Truck AG', 'Actros', '3340 6x4 Prime Mover',
   2022, '2022-06-10', '2025-06-09', 'Oman',
   'Navy Blue', 'Diesel', 'Automatic', 11946, 2,
   142000, 0, 'Under Maintenance',
   'Tariq Al-Balushi', 'Heavy Logistics', 'Muscat Logistics Yard',
   'National Life & General Insurance', 'NLGI-TRK-2022-9901', '2025-06-09', 1150.000,
   32000.000,
   '{"purchaseDate":"2022-06-10","purchaseValue":42000,"vendor":"Al-Zubair Automotive LLC"}'::jsonb,
   '{"purchaseValue":42000,"salvageValue":8000,"usefulLifeYears":7,"depreciationMethod":"Straight-Line","annualDepreciationRate":14.3}'::jsonb,
   '{"serviceIntervalKm":25000,"recommendedOilGrade":"15W-40","oilCapacityLitres":28}'::jsonb),

  -- Vehicle 4: Toyota Hilux 4x4 Single Cab
  ('eeeeeeee-0004-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'VH-004', '3201-D', 'ROP-REG-77182', 'MROER8CD4P0194821', '2TR-FE-77192',
   'Pickup', 'Operations', 'Toyota', 'Toyota Motor Corporation', 'Hilux', '2.7L 4x4 Manual Single Cab',
   2024, '2024-02-01', '2027-01-31', 'Oman',
   'Polar White', 'Petrol', 'Manual', 2694, 3,
   21800, 0, 'Active',
   'Nasser Al-Farsi', 'Field Operations', 'Muscat HQ Yard',
   'Dhofar Insurance Company SAOG', 'POL-DH-2024-44211', '2027-01-31', 290.000,
   9800.000,
   '{"purchaseDate":"2024-02-01","purchaseValue":11200,"vendor":"Zubair Automotive LLC"}'::jsonb,
   '{"purchaseValue":11200,"salvageValue":2200,"usefulLifeYears":5,"depreciationMethod":"Straight-Line","annualDepreciationRate":20}'::jsonb,
   '{"serviceIntervalKm":10000,"recommendedOilGrade":"10W-40","oilCapacityLitres":5.5}'::jsonb)
on conflict (id) do nothing;

-- 5. REMOVE AUTO-SEEDED CHART OF ACCOUNTS (created by migration triggers)
delete from public.accounts;
delete from public.bank_accounts;
