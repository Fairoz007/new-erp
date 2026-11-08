import { setup } from '../supabase/tests/harness.mjs';
import { writeFileSync, readFileSync } from 'fs';

export const FULL_SEED_SQL = `
-- =====================================================================
-- FLEETX ERP - COMPLETE ENTERPRISE MASTER & TRANSACTION SEED DATA
-- Offices, Users, Vehicles, Work Orders, Maintenance, Tyres, Invoices,
-- Payments, Payroll, Fixed Assets, Expenses, and Notifications.
-- =====================================================================

-- 1. COMPANIES & REGIONAL OFFICES
insert into public.companies (id, legacy_id, name, code, vat_number, country, city, currency)
values
  ('11111111-1111-1111-1111-111111111111', 'comp-1', 'Al Hakim National LLC - Head Office', 'AHN-HO',  'OM1100482910', 'Oman', 'Muscat', 'OMR'),
  ('22222222-2222-2222-2222-222222222222', 'comp-2', 'Al Hakim National LLC - Duqm Office', 'AHN-DQM', 'OM1100482910', 'Oman', 'Duqm',   'OMR'),
  ('33333333-3333-3333-3333-333333333333', 'comp-3', 'Al Hakim National LLC - Salalah Branch', 'AHN-SLL', 'OM1100482910', 'Oman', 'Salalah', 'OMR')
on conflict (id) do nothing;

-- 2. AUTH USERS & PROFILES (Password: 7YlY6CbYP32rM^lIhi)
do $users_seed$
declare
  v_password constant text := '7YlY6CbYP32rM^lIhi';
  u record;
  v_id uuid;
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

-- 3. BANK ACCOUNTS
insert into public.bank_accounts (id, company_id, bank_name, account_name, account_number, iban, currency, account_type, opening_balance, active)
values
  ('bbbbbbbb-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Bank Muscat SAOG', 'Main Corporate Operational Account', '0315-0048-2910-0001', 'OM64BMUS0315004829100001', 'OMR', 'Current', 45000.000, true),
  ('bbbbbbbb-0002-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Bank Dhofar SAOG', 'Duqm Regional Port Operations', '0108-9923-4410-0002', 'OM71BDOF0108992344100002', 'OMR', 'Current', 18500.000, true),
  ('bbbbbbbb-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'National Bank of Oman', 'Fleet Payroll & Allowances Pool', '1002-8834-5501-0003', 'OM55NBOM1002883455010003', 'OMR', 'Current', 12000.000, true)
on conflict (id) do nothing;

-- 4. SUPPLIERS & VENDORS
insert into public.suppliers (id, legacy_id, supplier_code, name, contact_person, phone, email, address, city, country, vat_number, payment_terms_days, credit_limit, supplier_type, status)
values
  ('cccccccc-0001-0000-0000-000000000001', 'sup-1', 'SUP-001', 'Zubair Automotive LLC', 'Salim Al-Busaidi', '+968 2450 0000', 'service@zubairautomotive.com', 'Azaiba Commercial Area', 'Muscat', 'Oman', 'OM1100234510', 30, 25000.000, 'Vehicle Dealer', 'Active'),
  ('cccccccc-0002-0000-0000-000000000002', 'sup-2', 'SUP-002', 'Oman Modern Workshop & Garage', 'Murugan Pillai', '+968 9944 1122', 'workshop@omanmodern.om', 'Wadi Kabir Industrial Area', 'Muscat', 'Oman', 'OM1100345620', 15, 10000.000, 'Workshop', 'Active'),
  ('cccccccc-0003-0000-0000-000000000003', 'sup-3', 'SUP-003', 'Michelin Tyres Oman (MHD LLC)', 'John D''Souza', '+968 2470 1234', 'tyres@mhd.om', 'Ruwi High Street', 'Muscat', 'Oman', 'OM1100456730', 45, 15000.000, 'Tyre Supplier', 'Active'),
  ('cccccccc-0004-0000-0000-000000000004', 'sup-4', 'SUP-004', 'Shell Oman Marketing SAOG', 'Hassan Al-Lawati', '+968 2457 4100', 'commercial@shelloman.com.om', 'Mina Al Fahal', 'Muscat', 'Oman', 'OM1100567840', 30, 30000.000, 'Fuel Supplier', 'Active'),
  ('cccccccc-0005-0000-0000-000000000005', 'sup-5', 'SUP-005', 'TotalEnergies Marketing Oman LLC', 'Khalfan Al-Kharusi', '+968 2469 8800', 'lubricants@totalenergies.om', 'Shatti Al Qurum', 'Muscat', 'Oman', 'OM1100678950', 30, 12000.000, 'Oil Supplier', 'Active'),
  ('cccccccc-0006-0000-0000-000000000006', 'sup-6', 'SUP-006', 'Dhofar Insurance Company SAOG', 'Suleiman Al-Hadhrami', '+968 2470 5300', 'fleet@dhofarinsurance.com', 'MBD Business District', 'Muscat', 'Oman', 'OM1100789060', 60, 50000.000, 'Insurance Company', 'Active'),
  ('cccccccc-0007-0000-0000-000000000007', 'sup-7', 'SUP-007', 'Wurth Gulf LLC Oman', 'Deepak Verma', '+968 2444 8899', 'orders@wurthgulf.om', 'Ghala Industrial Area', 'Muscat', 'Oman', 'OM1100890170', 30, 8000.000, 'Parts Supplier', 'Active')
on conflict (id) do nothing;

-- 5. CUSTOMERS & CORPORATE CLIENTS
insert into public.customers (id, legacy_id, customer_code, name, contact_person, phone, email, address, city, country, vat_number, payment_terms_days, credit_limit, customer_type, status)
values
  ('dddddddd-0001-0000-0000-000000000001', 'cust-1', 'CUST-001', 'Petroleum Development Oman (PDO)', 'Saud Al-Hinai (Logistics)', '+968 2467 8111', 'vendor.invoices@pdo.co.om', 'Mina Al Fahal Complex', 'Muscat', 'Oman', 'OM1100998811', 45, 100000.000, 'Corporate', 'Active'),
  ('dddddddd-0002-0000-0000-000000000002', 'cust-2', 'CUST-002', 'Oman Gas Company (OGC / OQ Gas Networks)', 'Talal Al-Aufi', '+968 2461 4000', 'transport@oqgn.om', 'Al Khuwair South', 'Muscat', 'Oman', 'OM1100887722', 30, 60000.000, 'Government', 'Active'),
  ('dddddddd-0003-0000-0000-000000000003', 'cust-3', 'CUST-003', 'Galfar Engineering & Contracting SAOG', 'Eng. Biju Varghese', '+968 2452 5000', 'procurement@galfar.com', 'Ghala Industrial Estate', 'Muscat', 'Oman', 'OM1100776633', 60, 80000.000, 'Corporate', 'Active'),
  ('dddddddd-0004-0000-0000-000000000004', 'cust-4', 'CUST-004', 'Renaissance Services SAOG', 'Fatma Al-Zadjali', '+968 2476 5900', 'contracts@renaissanceoman.com', 'Bausher Business Park', 'Muscat', 'Oman', 'OM1100665544', 30, 45000.000, 'Partner', 'Active'),
  ('dddddddd-0005-0000-0000-000000000005', 'cust-5', 'CUST-005', 'Al-Tasnim Enterprises LLC', 'Mahmood Al-Siyabi', '+968 2459 2345', 'fleet.billing@altasnim.com', 'Rusayl Industrial City', 'Muscat', 'Oman', 'OM1100554455', 30, 40000.000, 'Corporate', 'Active')
on conflict (id) do nothing;

-- 6. VEHICLES FLEET
insert into public.vehicles (id, company_id, vehicle_code, plate_number, vin, engine_number, vehicle_type, vehicle_category, brand, model, manufacturing_year, color, fuel_type, transmission, current_mileage, status, purchase, depreciation, oil_config)
values
  ('eeeeeeee-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'VH-001', '1042-A', 'JTEBU71J8M4091283', '1GR-FE-99214', 'SUV', 'Field Operations', 'Toyota', 'Land Cruiser GXR V6', 2024, 'Super White', 'Petrol', 'Automatic', 34200, 'Active', 
   '{"purchaseDate":"2024-01-15","purchaseValue":24500,"vendor":"Zubair Automotive LLC"}'::jsonb,
   '{"purchaseValue":24500,"salvageValue":5000,"usefulLifeYears":5,"depreciationMethod":"Straight-Line","annualDepreciationRate":20}'::jsonb,
   '{"serviceIntervalKm":10000,"recommendedOilGrade":"5W-30","oilCapacityLitres":6.8}'::jsonb),

  ('eeeeeeee-0002-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'VH-002', '8821-B', 'MP1TFS85JNT094812', '4JJ3-TCX-8812', 'Pickup', 'Field Operations', 'Isuzu', 'D-Max 3.0L Double Cab', 2023, 'Titanium Silver', 'Diesel', 'Manual', 58400, 'Active',
   '{"purchaseDate":"2023-03-20","purchaseValue":12800,"vendor":"Zubair Automotive LLC"}'::jsonb,
   '{"purchaseValue":12800,"salvageValue":2500,"usefulLifeYears":5,"depreciationMethod":"Straight-Line","annualDepreciationRate":20}'::jsonb,
   '{"serviceIntervalKm":10000,"recommendedOilGrade":"15W-40","oilCapacityLitres":8.5}'::jsonb),

  ('eeeeeeee-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'VH-003', '5519-C', 'WDB9340322L849102', 'OM501LA-4491', 'Heavy Truck', 'Heavy Logistics', 'Mercedes-Benz', 'Actros 3340 Prime Mover', 2022, 'Navy Blue', 'Diesel', 'Automatic', 142000, 'Under Maintenance',
   '{"purchaseDate":"2022-06-10","purchaseValue":42000,"vendor":"Al-Zubair Automotive LLC"}'::jsonb,
   '{"purchaseValue":42000,"salvageValue":8000,"usefulLifeYears":7,"depreciationMethod":"Straight-Line","annualDepreciationRate":14.3}'::jsonb,
   '{"serviceIntervalKm":25000,"recommendedOilGrade":"15W-40","oilCapacityLitres":28}'::jsonb),

  ('eeeeeeee-0004-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'VH-004', '3201-D', 'MROER8CD4P0194821', '2TR-FE-77192', 'Pickup', 'Field Operations', 'Toyota', 'Hilux 2.7L 4x4', 2024, 'Polar White', 'Petrol', 'Manual', 21800, 'Active',
   '{"purchaseDate":"2024-02-01","purchaseValue":11200,"vendor":"Zubair Automotive LLC"}'::jsonb,
   '{"purchaseValue":11200,"salvageValue":2200,"usefulLifeYears":5,"depreciationMethod":"Straight-Line","annualDepreciationRate":20}'::jsonb,
   '{"serviceIntervalKm":10000,"recommendedOilGrade":"10W-40","oilCapacityLitres":5.5}'::jsonb),

  ('eeeeeeee-0005-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'VH-005', '7740-E', 'JN8AY2NK8P9019284', 'VK56VD-66129', 'SUV', 'Executive Transport', 'Nissan', 'Patrol Titanium V8', 2023, 'Diamond Black', 'Petrol', 'Automatic', 45000, 'Active',
   '{"purchaseDate":"2023-05-12","purchaseValue":26500,"vendor":"Bahwan Motors LLC"}'::jsonb,
   '{"purchaseValue":26500,"salvageValue":6000,"usefulLifeYears":5,"depreciationMethod":"Straight-Line","annualDepreciationRate":20}'::jsonb,
   '{"serviceIntervalKm":10000,"recommendedOilGrade":"5W-40","oilCapacityLitres":7.5}'::jsonb),

  ('eeeeeeee-0006-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'VH-006', '4410-F', 'FEB71ER3S0049210', '4P10-T4-5510', 'Light Truck', 'Workshop Utility', 'Mitsubishi Fuso', 'Canter 4.2-Ton Box', 2022, 'Arctic White', 'Diesel', 'Manual', 89300, 'Active',
   '{"purchaseDate":"2022-08-18","purchaseValue":14200,"vendor":"General Automotive Co"}'::jsonb,
   '{"purchaseValue":14200,"salvageValue":2800,"usefulLifeYears":6,"depreciationMethod":"Straight-Line","annualDepreciationRate":16.7}'::jsonb,
   '{"serviceIntervalKm":10000,"recommendedOilGrade":"15W-40","oilCapacityLitres":9.0}'::jsonb),

  ('eeeeeeee-0007-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'VH-007', '6620-G', 'KMJWA37UAPU991823', 'D4CB-339182', 'Passenger Van', 'Staff Transport', 'Hyundai', 'H1 12-Seater Minibus', 2023, 'Sleek Silver', 'Diesel', 'Automatic', 62500, 'Active',
   '{"purchaseDate":"2023-04-05","purchaseValue":10500,"vendor":"OTEC Motors LLC"}'::jsonb,
   '{"purchaseValue":10500,"salvageValue":2000,"usefulLifeYears":5,"depreciationMethod":"Straight-Line","annualDepreciationRate":20}'::jsonb,
   '{"serviceIntervalKm":10000,"recommendedOilGrade":"5W-30","oilCapacityLitres":7.0}'::jsonb),

  ('eeeeeeee-0008-0000-0000-000000000008', '22222222-2222-2222-2222-222222222222', 'VH-008', '9912-H', 'MNBXXMR24PW819201', 'YN2X-881920', 'Pickup', 'Field Operations', 'Ford', 'Ranger XLT 2.0L Bi-Turbo', 2024, 'Meteor Grey', 'Diesel', 'Automatic', 18900, 'Active',
   '{"purchaseDate":"2024-03-10","purchaseValue":13500,"vendor":"Arabian Car Marketing"}'::jsonb,
   '{"purchaseValue":13500,"salvageValue":2700,"usefulLifeYears":5,"depreciationMethod":"Straight-Line","annualDepreciationRate":20}'::jsonb,
   '{"serviceIntervalKm":15000,"recommendedOilGrade":"0W-30","oilCapacityLitres":6.5}'::jsonb)
on conflict (id) do nothing;

-- 7. TYRES
insert into public.tyres (id, company_id, vehicle_id, position, brand, model, size, serial_number, tread_depth_mm, purchase_date, purchase_cost, status)
values
  ('ffffffff-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0001-0000-0000-000000000001', 'Front Left', 'Michelin', 'Primacy SUV', '285/65 R17', 'MIC-24-0191', 7.8, '2024-01-20', 65.000, 'Good'),
  ('ffffffff-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0001-0000-0000-000000000001', 'Front Right', 'Michelin', 'Primacy SUV', '285/65 R17', 'MIC-24-0192', 7.7, '2024-01-20', 65.000, 'Good'),
  ('ffffffff-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0001-0000-0000-000000000001', 'Rear Left', 'Michelin', 'Primacy SUV', '285/65 R17', 'MIC-24-0193', 7.5, '2024-01-20', 65.000, 'Good'),
  ('ffffffff-0004-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0001-0000-0000-000000000001', 'Rear Right', 'Michelin', 'Primacy SUV', '285/65 R17', 'MIC-24-0194', 7.5, '2024-01-20', 65.000, 'Good'),
  ('ffffffff-0005-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'eeeeeeee-0002-0000-0000-000000000002', 'Front Left', 'Bridgestone', 'Dueler A/T 697', '245/70 R16', 'BRD-23-4411', 6.2, '2023-03-25', 52.000, 'Good'),
  ('ffffffff-0006-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'eeeeeeee-0002-0000-0000-000000000002', 'Front Right', 'Bridgestone', 'Dueler A/T 697', '245/70 R16', 'BRD-23-4412', 6.1, '2023-03-25', 52.000, 'Good'),
  ('ffffffff-0007-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0003-0000-0000-000000000003', 'Front Left', 'Michelin', 'X Multiway 3D', '315/80 R22.5', 'MIC-22-9901', 4.8, '2022-06-15', 180.000, 'Due Soon'),
  ('ffffffff-0008-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0003-0000-0000-000000000003', 'Front Right', 'Michelin', 'X Multiway 3D', '315/80 R22.5', 'MIC-22-9902', 4.6, '2022-06-15', 180.000, 'Due Soon')
on conflict (id) do nothing;

-- 8. OIL CHANGES
insert into public.oil_changes (id, company_id, vehicle_id, date, odometer, oil_brand, oil_grade, quantity_litres, oil_cost, filter_cost, labour_cost, tax, total_cost, next_oil_change_mileage, next_oil_change_date, performed_by, notes)
values
  ('10000000-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0001-0000-0000-000000000001', '2026-09-15', 30000, 'Mobil 1', '5W-30 Full Synthetic', 6.8, 34.000, 4.500, 6.000, 2.225, 46.725, 40000, '2027-03-15', 'Murugan P.', 'Oil and OEM oil filter changed. Engine flush performed.'),
  ('10000000-0002-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'eeeeeeee-0002-0000-0000-000000000002', '2026-08-10', 50000, 'Shell Rimula', '15W-40 Heavy Duty Diesel', 8.5, 29.750, 6.000, 7.000, 2.138, 44.888, 60000, '2027-02-10', 'Khamis S.', 'Heavy diesel service completed. Fuel filter also replaced.'),
  ('10000000-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0005-0000-0000-000000000005', '2026-07-20', 40000, 'TotalEnergies Quartz', '5W-40 Full Synthetic', 7.5, 36.000, 5.000, 8.000, 2.450, 51.450, 50000, '2027-01-20', 'S. Al-Balushi', 'Periodic oil and air filter refresh.')
on conflict (id) do nothing;

-- 9. WORK ORDERS
insert into public.work_orders (id, company_id, vehicle_id, work_order_number, reported_date, problem_description, requested_by, workshop, supplier_id, priority, status, estimated_cost, parts_charges, labour_charges, additional_charges, tax, final_cost, approval_status, expected_completion, actual_completion)
values
  ('20000000-0001-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'eeeeeeee-0002-0000-0000-000000000002', 'WO-2026-001', '2026-09-01', '50,000 KM major maintenance: front brake pads replacement, rotor resurfacing and coolant flush', '00000000-0000-0000-0000-000000000003', 'Duqm Central Workshop', 'cccccccc-0002-0000-0000-000000000002', 'Medium', 'Approved', 350.000, 220.000, 90.000, 10.000, 16.000, 336.000, 'Approved', '2026-09-04', '2026-09-04'),
  ('20000000-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0003-0000-0000-000000000003', 'WO-2026-002', '2026-10-18', 'Transmission hard shifting and heavy clutch slippage under load. Full clutch plate and pressure assembly overhaul.', '00000000-0000-0000-0000-000000000003', 'Oman Modern Workshop & Garage', 'cccccccc-0002-0000-0000-000000000002', 'Critical', 'In Progress', 850.000, 580.000, 220.000, 10.000, 40.000, 850.000, 'Approved', '2026-11-15', null),
  ('20000000-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0001-0000-0000-000000000001', 'WO-2026-003', '2026-08-15', 'Air conditioning compressor noise and low cooling efficiency in high ambient desert heat.', '00000000-0000-0000-0000-000000000003', 'Zubair Service Center', 'cccccccc-0001-0000-0000-000000000001', 'High', 'Approved', 220.000, 140.000, 60.000, 0.000, 10.000, 210.000, 'Approved', '2026-08-18', '2026-08-18')
on conflict (id) do nothing;

update public.work_orders set status = 'Completed', actual_completion = '2026-09-04' where id = '20000000-0001-0000-0000-000000000001';
update public.work_orders set status = 'Completed', actual_completion = '2026-08-18' where id = '20000000-0003-0000-0000-000000000003';

-- 10. MAINTENANCE RECORDS
insert into public.maintenance_records (id, company_id, vehicle_id, work_order_id, record_number, maintenance_date, maintenance_type, category, description, odometer_reading, service_centre, supplier_id, technician, parts_cost, labour_cost, tax, total_cost, next_service_mileage, payment_status)
values
  ('30000000-0001-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'eeeeeeee-0002-0000-0000-000000000002', '20000000-0001-0000-0000-000000000001', 'MNT-2026-001', '2026-09-04', 'Preventive Maintenance', 'Brake Service', 'Completed 50K service, replaced front pads & resurfaced rotors', 50120, 'Duqm Central Workshop', 'cccccccc-0002-0000-0000-000000000002', 'Murugan P.', 220.000, 90.000, 16.000, 336.000, 60000, 'Paid'),
  ('30000000-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0001-0000-0000-000000000001', '20000000-0003-0000-0000-000000000003', 'MNT-2026-002', '2026-08-18', 'Corrective Maintenance', 'AC System', 'AC expansion valve replaced and system recharged with R134a refrigerant', 28500, 'Zubair Service Center', 'cccccccc-0001-0000-0000-000000000001', 'K. Al-Shehhi', 140.000, 60.000, 10.000, 210.000, 38500, 'Paid')
on conflict (id) do nothing;

-- 11. INVOICES & INVOICE LINES
insert into public.invoices (id, company_id, invoice_number, invoice_type, party_type, supplier_id, customer_id, party_snapshot, invoice_date, due_date, reference_number, purchase_order_number, work_order_id, vehicle_id, subtotal, tax_total, grand_total, amount_paid, payment_status, approval_status, payment_terms_days, currency)
values
  -- Purchase AP 1: Oman Modern Garage
  ('40000000-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'PINV-2026-0001', 'Purchase', 'Supplier', 'cccccccc-0002-0000-0000-000000000002', null, '{"name":"Oman Modern Workshop & Garage","vatNumber":"OM1100345620","address":"Wadi Kabir"}'::jsonb, '2026-09-05', '2026-10-05', 'OMW-INV-9921', 'PO-2026-081', '20000000-0001-0000-0000-000000000001', 'eeeeeeee-0002-0000-0000-000000000002', 320.000, 16.000, 336.000, 336.000, 'Paid', 'Approved', 30, 'OMR'),

  -- Purchase AP 2: Michelin Tyres
  ('40000000-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'PINV-2026-0002', 'Purchase', 'Supplier', 'cccccccc-0003-0000-0000-000000000003', null, '{"name":"Michelin Tyres Oman (MHD LLC)","vatNumber":"OM1100456730","address":"Ruwi High Street"}'::jsonb, '2026-09-12', '2026-10-27', 'MHD-TYRE-4410', 'PO-2026-088', null, 'eeeeeeee-0003-0000-0000-000000000003', 720.000, 36.000, 756.000, 400.000, 'Partially Paid', 'Approved', 45, 'OMR'),

  -- Purchase AP 3: Shell Oman Marketing
  ('40000000-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'PINV-2026-0003', 'Purchase', 'Supplier', 'cccccccc-0004-0000-0000-000000000004', null, '{"name":"Shell Oman Marketing SAOG","vatNumber":"OM1100567840","address":"Mina Al Fahal"}'::jsonb, '2026-10-01', '2026-10-31', 'SHELL-CORP-1082', 'PO-2026-095', null, null, 1450.000, 72.500, 1522.500, 0.000, 'Unpaid', 'Approved', 30, 'OMR'),

  -- Sales AR 1: Petroleum Development Oman
  ('40000000-0004-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'INV-2026-0001', 'Sales', 'Customer', null, 'dddddddd-0001-0000-0000-000000000001', '{"name":"Petroleum Development Oman (PDO)","vatNumber":"OM1100998811","address":"Mina Al Fahal"}'::jsonb, '2026-09-01', '2026-10-15', 'PDO-CONTR-771', 'PDO-PO-99120', null, 'eeeeeeee-0001-0000-0000-000000000001', 3200.000, 160.000, 3360.000, 3360.000, 'Paid', 'Approved', 45, 'OMR'),

  -- Sales AR 2: Galfar Engineering
  ('40000000-0005-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'INV-2026-0002', 'Sales', 'Customer', null, 'dddddddd-0003-0000-0000-000000000003', '{"name":"Galfar Engineering & Contracting SAOG","vatNumber":"OM1100776633","address":"Ghala"}'::jsonb, '2026-09-25', '2026-11-25', 'GAL-LEASE-339', 'GAL-PO-44812', null, 'eeeeeeee-0004-0000-0000-000000000004', 2400.000, 120.000, 2520.000, 0.000, 'Unpaid', 'Approved', 60, 'OMR'),

  -- Sales AR 3: Oman Gas Company
  ('40000000-0006-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'INV-2026-0003', 'Sales', 'Customer', null, 'dddddddd-0002-0000-0000-000000000002', '{"name":"Oman Gas Company (OGC)","vatNumber":"OM1100887722","address":"Al Khuwair"}'::jsonb, '2026-10-05', '2026-11-05', 'OGC-SHUTTLE-11', 'OGC-PO-11928', null, 'eeeeeeee-0007-0000-0000-000000000007', 1800.000, 90.000, 1890.000, 0.000, 'Unpaid', 'Approved', 30, 'OMR')
on conflict (id) do nothing;

-- Invoice Lines
insert into public.invoice_lines (invoice_id, line_no, item_code, description, quantity, unit, unit_price, tax_rate_percentage, vehicle_id)
values
  ('40000000-0001-0000-0000-000000000001', 1, 'SRV-BRK', 'Front brake pads & disc overhaul', 1, 'Job', 320.000, 5, 'eeeeeeee-0002-0000-0000-000000000002'),
  ('40000000-0002-0000-0000-000000000002', 1, 'TYR-315', 'Michelin Heavy Truck Tyres 315/80 R22.5', 4, 'Pcs', 180.000, 5, 'eeeeeeee-0003-0000-0000-000000000003'),
  ('40000000-0003-0000-0000-000000000003', 1, 'LUB-BULK', 'Shell Rimula Heavy Diesel Bulk Oil', 1, 'Lot', 1450.000, 5, null),
  ('40000000-0004-0000-0000-000000000004', 1, 'RNT-LC', 'Monthly Fleet Lease: 4x 4WD Toyota Land Cruiser', 1, 'Month', 3200.000, 5, 'eeeeeeee-0001-0000-0000-000000000001'),
  ('40000000-0005-0000-0000-000000000005', 1, 'LOG-CONV', 'Field Operations Transport & Logistics Support', 1, 'Month', 2400.000, 5, 'eeeeeeee-0004-0000-0000-000000000004'),
  ('40000000-0006-0000-0000-000000000006', 1, 'SHT-PASS', 'Staff Shuttle Bus Dedicated Service (Hyundai H1)', 1, 'Month', 1800.000, 5, 'eeeeeeee-0007-0000-0000-000000000007')
on conflict (invoice_id, line_no) do nothing;

-- 12. PAYMENTS
insert into public.payments (id, company_id, payment_number, invoice_id, payment_date, amount, payment_method, bank_account_id, transaction_reference, cheque_number, notes)
values
  ('50000000-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'PAY-2026-0001', '40000000-0001-0000-0000-000000000001', '2026-09-20', 336.000, 'Bank Transfer', 'bbbbbbbb-0001-0000-0000-000000000001', 'BM-TRF-992144', null, 'Full settlement for invoice PINV-2026-0001 brake service'),
  ('50000000-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'PAY-2026-0002', '40000000-0002-0000-0000-000000000002', '2026-10-10', 400.000, 'Cheque', 'bbbbbbbb-0001-0000-0000-000000000001', 'CHQ-881249', 'CHQ-881249', 'Part payment on Michelin truck tyres invoice PINV-2026-0002'),
  ('50000000-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'REC-2026-0001', '40000000-0004-0000-0000-000000000004', '2026-09-28', 3360.000, 'Bank Transfer', 'bbbbbbbb-0001-0000-0000-000000000001', 'PDO-WIRE-88102', null, 'Full receipt for INV-2026-0001 contract billing')
on conflict (id) do nothing;

-- 13. FIXED ASSETS
insert into public.fixed_assets (id, company_id, asset_code, name, category, serial_number, vehicle_id, location, department, purchase_date, purchase_cost, salvage_value, useful_life_years, annual_rate_percentage, depreciation_method, accumulated_depreciation, gl_asset_account, gl_expense_account, gl_accum_dep_account, status)
values
  ('60000000-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'FA-001', 'Toyota Land Cruiser 2024 (1042-A)', 'Fleet Vehicle', 'JTEBU71J8M4091283', 'eeeeeeee-0001-0000-0000-000000000001', 'Muscat HQ Yard', 'Operations', '2024-01-15', 24500.000, 5000.000, 5, 20.0, 'Straight-Line', 3900.000, '1500', '5080', '1520', 'Active'),
  ('60000000-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'FA-002', 'Mercedes-Benz Actros 3340 (5519-C)', 'Heavy Machinery', 'WDB9340322L849102', 'eeeeeeee-0003-0000-0000-000000000003', 'Muscat Heavy Logistics Yard', 'Transport', '2022-06-10', 42000.000, 8000.000, 7, 14.3, 'Straight-Line', 14570.000, '1500', '5080', '1520', 'Active'),
  ('60000000-0003-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'FA-003', 'Rotary 4-Post Heavy Vehicle Workshop Lift', 'Workshop Equipment', 'ROTARY-4P-9921', null, 'Duqm Central Workshop', 'Maintenance', '2023-01-10', 12000.000, 1500.000, 10, 10.0, 'Straight-Line', 2100.000, '1530', '5080', '1540', 'Active')
on conflict (id) do nothing;

-- 14. EMPLOYEES & HR
insert into public.employees (id, company_id, employee_code, name, civil_id, passport_number, nationality, joining_date, designation, department, phone, email, basic_salary, housing_allowance, transport_allowance, other_allowances, bank_name, bank_account_number, iban, status)
values
  ('70000000-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'EMP-001', 'Tariq Al-Balushi', '10982341', 'O0982341', 'Omani', '2021-02-01', 'Senior Fleet Controller', 'Operations', '+968 9811 2233', 'tariq.balushi@hakim.com', 850.000, 250.000, 100.000, 50.000, 'Bank Muscat', '0315-0982-1100', 'OM88BMUS0315098211000001', 'Active'),
  ('70000000-0002-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'EMP-002', 'Rashid Al-Harthy', '11093822', 'O1109382', 'Omani', '2022-05-15', 'Lead Workshop Mechanic', 'Maintenance', '+968 9722 3344', 'rashid.harthy@hakim.com', 650.000, 200.000, 80.000, 40.000, 'Bank Dhofar', '0108-8833-2211', 'OM64BDOF0108883322110001', 'Active'),
  ('70000000-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'EMP-003', 'Salem Al-Mamari', '10449912', 'O1044991', 'Omani', '2020-09-01', 'Heavy Vehicle Transport Driver', 'Operations', '+968 9633 4455', 'salem.mamari@hakim.com', 480.000, 150.000, 70.000, 50.000, 'Bank Muscat', '0315-7766-5544', 'OM44BMUS0315776655440001', 'Active'),
  ('70000000-0004-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'EMP-004', 'Nasser Al-Farsi', '11993321', 'O1199332', 'Omani', '2023-01-10', 'Commercial Field Driver', 'Operations', '+968 9544 5566', 'nasser.farsi@hakim.com', 460.000, 150.000, 70.000, 40.000, 'Bank Dhofar', '0108-6655-4433', 'OM92BDOF0108665544330001', 'Active')
on conflict (id) do nothing;

-- 15. EXPENSES
insert into public.expenses (id, company_id, vehicle_id, expense_number, date, category, description, quantity, unit_price, tax, total, payment_method, supplier_id)
values
  ('80000000-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0001-0000-0000-000000000001', 'EXP-2026-0001', '2026-09-18', 'Fuel', 'Shell card diesel refill for PDO desert route convoy', 120, 0.239, 1.434, 30.114, 'Credit Card', 'cccccccc-0004-0000-0000-000000000004'),
  ('80000000-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0001-0000-0000-000000000001', 'EXP-2026-0002', '2026-01-15', 'Registration', 'ROP Mulkiya vehicle ownership card & annual permit renewal', 1, 65.000, 0.000, 65.000, 'Online', null),
  ('80000000-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0003-0000-0000-000000000003', 'EXP-2026-0003', '2026-06-10', 'Insurance', 'Comprehensive commercial fleet insurance annual premium', 1, 1280.000, 0.000, 1280.000, 'Bank Transfer', 'cccccccc-0006-0000-0000-000000000006')
on conflict (id) do nothing;

-- 16. ACCIDENTS
insert into public.accidents (id, company_id, vehicle_id, accident_number, accident_date, accident_time, location, accident_type, driver_name, damage_description, actual_repair_cost, estimated_repair_cost, insurance_contribution, third_party_contribution, insurance_claim_number, police_report_number, workshop, status)
values
  ('90000000-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'eeeeeeee-0004-0000-0000-000000000004', 'ACC-2026-001', '2026-07-14', '14:30:00', 'Rusayl Industrial Roundabout', 'Minor Collision', 'Salem Al-Mamari', 'Rear bumper cover cracked and tail light cluster damaged during slow reverse maneuver.', 280.000, 300.000, 230.000, 0.000, 'CLM-DHO-2026-8812', 'ROP-ROP-44910', 'Oman Modern Workshop & Garage', 'Closed')
on conflict (id) do nothing;

-- 17. NOTIFICATIONS
insert into public.notifications (id, company_id, title, message, type, severity, link, created_at)
values
  ('a0000000-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Vehicle Service Milestone Due Soon', 'Toyota Hilux (3201-D) is approaching its scheduled 25,000 KM service interval in approximately 700 KM.', 'service_milestone', 'warning', '/vehicles', now() - interval '2 days'),
  ('a0000000-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Mulkiya Registration Expiry Alert', 'Mercedes-Benz Actros (5519-C) ROP commercial registration expires in 22 days.', 'document_expiry', 'warning', '/vehicles', now() - interval '1 day'),
  ('a0000000-0003-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Pending Invoice Signoff', 'Shell Oman Marketing invoice PINV-2026-0003 for OMR 1,522.500 requires approval.', 'pending_approval', 'info', '/invoices', now() - interval '3 hours')
on conflict (id) do nothing;
`;

async function run() {
  const t = await setup('supabase/migrations', { quiet: true });
  console.log('Testing full seed SQL on PGlite...');
  await t.db.exec(FULL_SEED_SQL);
  console.log('Full Seed SQL executed successfully without any errors!');

  // Check counts
  const tables = ['companies', 'profiles', 'bank_accounts', 'suppliers', 'customers', 'vehicles', 'tyres', 'oil_changes', 'work_orders', 'maintenance_records', 'invoices', 'invoice_lines', 'payments', 'fixed_assets', 'employees', 'expenses', 'accidents', 'notifications'];
  const summary = {};
  for (const tbl of tables) {
    const res = await t.db.query('select count(*) as c from public.' + tbl);
    summary[tbl] = Number(res.rows[0].c);
  }
  console.log('Seeded database record counts:', summary);
  writeFileSync('supabase/seed.sql', FULL_SEED_SQL, 'utf8');
  console.log('Updated supabase/seed.sql successfully');
}

run().catch(err => {
  console.error('Seed execution error:', err);
  process.exit(1);
});
