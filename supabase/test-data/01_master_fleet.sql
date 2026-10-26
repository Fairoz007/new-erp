-- =====================================================================
-- Test data phase 1/5: suppliers, customers, bank accounts, 400 vehicles,
-- tyres, employees, fixed assets. One year: 2025-11-01 .. today.
-- Runs as superadmin@hakim.com so every RLS/permission check applies.
-- Skips itself when vehicles already exist.
-- Run: npx supabase db query --linked -f supabase/test-data/01_master_fleet.sql
-- =====================================================================
do $gen$
declare
  v_admin uuid;
  c_ho uuid; c_dq uuid; v_comp uuid;
  i int; j int; v_id uuid; v_sup uuid[]; v_cat record; v_pdate date; v_cost numeric; v_code text;
  brands text[][] := array[
    -- brand, model, type, category, fuel, cost, slug
    array['Toyota','Land Cruiser 300','SUV','Executive','Petrol','32000','toyota-land-cruiser'],
    array['Toyota','Hilux Double Cab','Pickup','Operations','Diesel','11500','toyota-hilux'],
    array['Toyota','Hiace','Van','Logistics','Diesel','13500','toyota-hiace'],
    array['Toyota','Coaster','Bus','Pool','Diesel','24000','toyota-coaster'],
    array['Nissan','Patrol','SUV','Executive','Petrol','29000','nissan-patrol'],
    array['Nissan','Navara','Pickup','Service','Diesel','10200','nissan-navara'],
    array['Mitsubishi','L200','Pickup','Operations','Diesel','9800','mitsubishi-l200'],
    array['Mitsubishi','Fuso Canter','Truck','Logistics','Diesel','21000','mitsubishi-canter'],
    array['Isuzu','D-Max','Pickup','Service','Diesel','9600','isuzu-dmax'],
    array['Isuzu','NPR','Truck','Logistics','Diesel','19500','isuzu-npr'],
    array['Hyundai','Tucson','SUV','Sales','Petrol','10800','hyundai-tucson'],
    array['Hyundai','H-1','Van','Pool','Diesel','12000','hyundai-h1'],
    array['Ford','Ranger','Pickup','Operations','Diesel','11200','ford-ranger'],
    array['Volvo','FH16','Truck','Logistics','Diesel','52000','volvo-fh16'],
    array['Caterpillar','320 Excavator','Heavy Equipment','Operations','Diesel','68000','cat-320'],
    array['Kia','Sorento','SUV','Sales','Hybrid','12500','kia-sorento']];
  drivers text[] := array['Ahmed','Khalid','Said','Hamed','Yousuf','Salim','Rashid','Nasser','Hilal','Majid','Faisal','Talal','Sami','Imran','Ravi','Joseph'];
  lastn text[] := array['Al-Harthy','Al-Balushi','Al-Maskari','Al-Kindi','Al-Farsi','Al-Habsi','Al-Lawati','Al-Rawahi','Al-Siyabi','Al-Busaidi','Al-Hinai','Al-Shukaili'];
  sup_types text[] := array['Garage','Workshop','Tyre Supplier','Oil Supplier','Parts Supplier','Insurance Company','Fuel Supplier','Vehicle Dealer'];
  cust_types text[] := array['Corporate','Government','Partner','Individual'];
  depts text[] := array['Fleet & Logistics','Workshop & Maintenance','Finance & Accounts','Supply Chain & Procurement','VIP Protocol & Drivers','Operations','Administration & HR'];
  positions text[] := array['Tyre','Front Left','Front Right','Rear Left','Rear Right','Spare'];
begin
  if exists (select 1 from public.vehicles) then
    raise notice 'Phase 1 skipped: vehicles already exist'; return;
  end if;
  perform setseed(0.2026);
  select id into v_admin from auth.users where email = 'superadmin@hakim.com';
  if v_admin is null then raise exception 'Run supabase/seed.sql first (superadmin@hakim.com missing)'; end if;
  perform set_config('request.jwt.claim.sub', v_admin::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, false);
  perform set_config('request.uid', v_admin::text, false);   -- local test harness
  select id into c_ho from public.companies where legacy_id = 'comp-1';
  select id into c_dq from public.companies where legacy_id = 'comp-2';

  -- Offices: logo paths (uploaded by upload-media step)
  update public.companies set logo = id || '/logos/hakim-logo.png',
         phone = '+968 2456 7800', email = 'info@hakim.com', website = 'https://hakim.com', financial_year = '2026'
  where id in (c_ho, c_dq);

  -- Approval rules (work orders >= 500 OMR need sign-off; >= 1,000 OMR need two levels)
  if not exists (select 1 from public.approval_rules) then
    insert into public.approval_rules (module, threshold_amount, currency, required_roles, description, active) values
      ('maintenance', 500,  'OMR', array['Fleet Manager']::public.user_role[], 'Work orders from 500 OMR need Fleet Manager approval', true),
      ('maintenance', 1000, 'OMR', array['Fleet Manager','Finance Manager']::public.user_role[], 'Work orders from 1,000 OMR need Fleet and Finance approval', true),
      ('invoice',     1000, 'OMR', array['Finance Manager']::public.user_role[], 'Invoices from 1,000 OMR need Finance Manager approval', true),
      ('expense',     250,  'OMR', array['Finance Manager']::public.user_role[], 'Expenses from 250 OMR need Finance Manager approval', true);
  end if;

  -- Bank accounts on GL 1020
  insert into public.bank_accounts (company_id, bank_name, account_name, account_number, iban, account_type, gl_account_code, opening_balance)
  values (c_ho, 'Bank Muscat SAOG', 'HO Operating Account', '0423019283010019', 'OM810270423019283010019', 'Current', '1020', 250000),
         (c_ho, 'National Bank of Oman', 'HO Payroll Account', '10992837401920', 'OM230181099283740192000', 'Current', '1020', 120000),
         (c_dq, 'Bank Muscat SAOG', 'Duqm Operating Account', '0423019283010088', 'OM810270423019283010088', 'Current', '1020', 140000),
         (c_dq, 'National Bank of Oman', 'Duqm Petty Cash', '10992837401955', 'OM230181099283740195500', 'Petty Cash', '1010', 15000);

  -- Opening equity so balances start from a funded position
  perform public.post_journal_entry(c_ho, date '2025-11-01', 'Opening balances', jsonb_build_array(
      jsonb_build_object('account_code','1020','debit', 370000),
      jsonb_build_object('account_code','3010','credit', 370000)), 'OPENING', 'Manual');
  perform public.post_journal_entry(c_dq, date '2025-11-01', 'Opening balances', jsonb_build_array(
      jsonb_build_object('account_code','1020','debit', 140000),
      jsonb_build_object('account_code','1010','debit', 15000),
      jsonb_build_object('account_code','3010','credit', 155000)), 'OPENING', 'Manual');

  -- 60 suppliers, 80 customers (group-level)
  for i in 1..60 loop
    insert into public.suppliers (supplier_code, name, supplier_type, contact_person, phone, email, address, city, country,
                                  vat_number, payment_terms_days, credit_limit, bank_details, status)
    values ('SUP-' || lpad(i::text, 3, '0'),
            (array['Zubair','Saud Bahwan','Shell Oman','Muscat Tyre','Al Jenaibi','Towell','OQ Fuel','Bridgestone Oman','Al Madina Parts','Dhofar Insurance'])[1 + (i % 10)]
              || ' ' || (array['Automotive','Trading','Services','Workshop','Supplies','Group'])[1 + (i % 6)] || ' ' || i,
            sup_types[1 + (i % array_length(sup_types, 1))],
            drivers[1 + (i % 16)] || ' ' || lastn[1 + (i % 12)], '+968 9' || lpad((1000000 + i * 7919)::text, 7, '0'),
            'ap' || i || '@supplier' || i || '.om', 'Building ' || (100 + i) || ', Way ' || (3000 + i),
            (array['Muscat','Sohar','Nizwa','Duqm','Salalah'])[1 + (i % 5)], 'Oman', 'OM11' || lpad((482910 + i)::text, 8, '0'),
            (array[15, 30, 45, 60])[1 + (i % 4)], 5000 + (i % 10) * 2500,
            jsonb_build_object('bankName','Bank Muscat','accountNumber','04230' || lpad(i::text, 9, '0'),'iban','OM81027' || lpad(i::text, 16, '0'),'swiftCode','BMUSOMRX'),
            'Active');
  end loop;
  for i in 1..80 loop
    insert into public.customers (customer_code, name, customer_type, contact_person, phone, email, address, city, country,
                                  vat_number, payment_terms_days, credit_limit, status)
    values ('CUST-' || lpad(i::text, 3, '0'),
            (array['Petroleum Development Oman','Oman LNG','Duqm Refinery','Asyad Logistics','Port of Duqm','Ministry of Transport','Omantel','Oman Airports','Sohar Aluminium','Nama Electricity'])[1 + (i % 10)]
              || case when i > 10 then ' - Contract ' || i else '' end,
            cust_types[1 + (i % 4)], drivers[1 + ((i + 3) % 16)] || ' ' || lastn[1 + ((i + 5) % 12)],
            '+968 2' || lpad((4000000 + i * 104729 % 9999999)::text, 7, '0'), 'finance' || i || '@client' || i || '.om',
            'P.O. Box ' || (100 + i), (array['Muscat','Duqm','Sohar','Salalah'])[1 + (i % 4)], 'Oman',
            'OM12' || lpad((100000 + i)::text, 8, '0'), (array[30, 45, 60])[1 + (i % 3)], 20000 + (i % 8) * 10000, 'Active');
  end loop;
  select array_agg(id order by supplier_code) into v_sup from public.suppliers;

  -- 400 vehicles: 280 Head Office, 120 Duqm
  for i in 1..400 loop
    v_comp := case when i <= 280 then c_ho else c_dq end;
    j := 1 + ((i * 7) % array_length(brands, 1));
    v_pdate := date '2019-01-01' + ((i * 37) % 2400);
    v_cost := brands[j][6]::numeric * (0.9 + random()::numeric * 0.25);
    insert into public.vehicles (company_id, vehicle_code, plate_number, registration_number, vin, engine_number,
        vehicle_type, vehicle_category, brand, manufacturer, model, variant, manufacturing_year, registration_date,
        registration_expiry_date, country_of_registration, color, fuel_type, transmission, engine_capacity_cc,
        number_of_seats, current_mileage, initial_odometer, status, photo_url, assigned_driver, department, location,
        purchase, depreciation, oil_config, current_market_value, market_value_updated_date,
        insurance_provider, insurance_policy_number, insurance_expiry_date, insurance_premium_annual, notes)
    values (v_comp, 'VH-' || lpad(i::text, 4, '0'),
        (1000 + i) || ' ' || (array['AA','AB','BM','DR','HS','KQ','MR','SW'])[1 + (i % 8)],
        'REG-' || (2019 + (i % 7)) || '-' || lpad(i::text, 5, '0'),
        upper(substr(md5('vin' || i), 1, 17)), 'ENG-' || upper(substr(md5('eng' || i), 1, 10)),
        brands[j][3], brands[j][4], brands[j][1], brands[j][1], brands[j][2],
        (array['Standard','GX','GXR','VX','Limited','Base'])[1 + (i % 6)], extract(year from v_pdate)::int,
        v_pdate, (date '2025-11-15' + ((i * 13) % 400)), 'Oman',
        (array['White','Silver','Black','Grey','Blue','Beige'])[1 + (i % 6)], brands[j][5],
        case when brands[j][3] in ('Truck','Heavy Equipment') then 'Manual' else 'Automatic' end,
        (array[2400, 2800, 3500, 4000, 4600, 12800])[1 + (i % 6)],
        case brands[j][3] when 'Bus' then 30 when 'Van' then 12 when 'Truck' then 3 when 'Heavy Equipment' then 1 else 5 end,
        20000 + ((i * 7349) % 160000), 10 + (i % 50),
        (array['Active','Active','Active','Active','Active','Active','Active','Active','Under Maintenance','Reserved','Inactive'])[1 + (i % 11)],
        v_comp || '/vehicles/' || brands[j][7] || '.jpg',
        drivers[1 + (i % 16)] || ' ' || lastn[1 + (i % 12)], depts[1 + (i % 7)],
        case when v_comp = c_ho then 'Muscat Yard ' || (1 + i % 3) else 'Duqm Base' end,
        jsonb_build_object('purchaseDate', v_pdate, 'purchaseValue', round(v_cost, 3),
            'purchaseInvoiceNumber', 'PV-' || lpad(i::text, 5, '0'), 'supplierId', v_sup[1 + (i % 60)],
            'supplierName', (select name from public.suppliers where id = v_sup[1 + (i % 60)]),
            'paymentMethod', (array['Bank Transfer','Finance / Loan','Cash','Lease'])[1 + (i % 4)],
            'warrantyStartDate', v_pdate, 'warrantyExpiryDate', v_pdate + 1095, 'warrantyMileageLimit', 100000),
        jsonb_build_object('depreciationMethod', 'Straight-Line', 'usefulLifeYears', 5, 'annualRatePercentage', 20,
            'salvageValue', round(v_cost * 0.1, 3)),
        jsonb_build_object('oilType', 'Fully Synthetic', 'oilBrand', (array['Shell Helix','Mobil 1','Castrol Edge','Total Quartz'])[1 + (i % 4)],
            'oilGrade', (array['5W-30','5W-40','10W-40','15W-40'])[1 + (i % 4)], 'intervalKm', 10000, 'intervalMonths', 6,
            'estimatedCost', 45 + (i % 5) * 10, 'capacityLitres', 6 + (i % 4)),
        round(v_cost * (0.55 + random()::numeric * 0.3), 3), date '2026-09-30',
        (array['Dhofar Insurance','Oman Insurance','AXA Gulf','National Life & General'])[1 + (i % 4)],
        'POL-' || lpad((880000 + i)::text, 7, '0'), date '2025-12-01' + ((i * 29) % 380),
        round(250 + v_cost * 0.025, 3), null)
    returning id into v_id;

    -- 5 tyres per vehicle
    for j in 2..6 loop
      insert into public.tyres (company_id, vehicle_id, brand, model, size, serial_number, position, purchase_date, purchase_cost,
          installation_date, installation_mileage, expected_life_km, current_mileage, tread_depth_mm, supplier_id, status)
      values (v_comp, v_id, (array['Bridgestone','Michelin','Yokohama','Continental','Pirelli'])[1 + (i % 5)],
          (array['Dueler H/T','LTX Force','Geolandar','CrossContact','Scorpion'])[1 + (i % 5)],
          (array['265/65R17','285/60R18','225/70R15','315/80R22.5'])[1 + (i % 4)],
          'TY' || lpad((i * 10 + j)::text, 7, '0'), positions[j], date '2025-11-01' + ((i + j) % 300),
          60 + (i % 6) * 15, date '2025-11-01' + ((i + j) % 300), 15000 + (i * 31 % 90000), 60000,
          25000 + (i * 31 % 90000), round((1.5 + random()::numeric * 7)::numeric, 1), v_sup[1 + (3 + i) % 60],
          (array['Good','Good','Good','Fair','Due Soon','Critical'])[1 + ((i + j) % 6)]);
    end loop;
  end loop;

  -- 150 employees (drivers, technicians, finance, admin)
  for i in 1..150 loop
    v_comp := case when i <= 100 then c_ho else c_dq end;
    insert into public.employees (company_id, employee_code, name, designation, department, email, phone, civil_id, nationality,
        joining_date, status, basic_salary, housing_allowance, transport_allowance, other_allowances, bank_name,
        bank_account_number, iban, payment_method, social_security_number, pasi_employee_pct, pasi_employer_pct, assigned_vehicle_id)
    values (v_comp, 'EMP-' || (1000 + i), drivers[1 + (i % 16)] || ' ' || lastn[1 + ((i * 5) % 12)],
        (array['Driver','Senior Driver','Mechanic','Fleet Coordinator','Accountant','Storekeeper','HR Officer','Workshop Supervisor'])[1 + (i % 8)],
        depts[1 + (i % 7)], 'emp' || i || '@hakim.com', '+968 9' || lpad((2000000 + i * 3571)::text, 7, '0'),
        lpad((10000000 + i * 4111)::text, 8, '0'), case when i % 3 = 0 then 'Indian' when i % 5 = 0 then 'Pakistani' else 'Omani' end,
        date '2018-01-01' + ((i * 53) % 2700), case when i % 40 = 0 then 'On Leave' else 'Active' end,
        350 + (i % 10) * 85, 100 + (i % 4) * 25, 50 + (i % 3) * 20, (i % 5) * 15,
        'Bank Muscat', '0423' || lpad(i::text, 10, '0'), 'OM810270423' || lpad(i::text, 12, '0'), 'Bank Transfer',
        'SSN-' || lpad(i::text, 6, '0'), case when i % 3 = 0 or i % 5 = 0 then 0 else 7 end,
        case when i % 3 = 0 or i % 5 = 0 then 1 else 11.5 end,
        (select id from public.vehicles where company_id = v_comp order by vehicle_code offset (i % 90) limit 1));
  end loop;

  -- Fixed assets: one per vehicle + 40 workshop/IT items
  insert into public.fixed_assets (company_id, asset_code, name, category, serial_number, vehicle_id, location, department,
      purchase_date, purchase_cost, salvage_value, useful_life_years, annual_rate_percentage, depreciation_method,
      accumulated_depreciation, gl_asset_account, gl_expense_account, gl_accum_dep_account, supplier_id)
  select v.company_id, 'FA-' || v.vehicle_code, v.brand || ' ' || v.model || ' (' || v.plate_number || ')', 'Fleet Vehicle',
         v.vin, v.id, v.location, v.department, date '2025-11-01',
         (v.purchase->>'purchaseValue')::numeric, (v.depreciation->>'salvageValue')::numeric, 5, 20, 'Straight-Line',
         least(((v.purchase->>'purchaseValue')::numeric - (v.depreciation->>'salvageValue')::numeric) * 0.2
               * greatest(0, (date '2025-11-01' - (v.purchase->>'purchaseDate')::date)) / 365.0,
               ((v.purchase->>'purchaseValue')::numeric - (v.depreciation->>'salvageValue')::numeric)),
         '1510', '5080', '1520', (v.purchase->>'supplierId')::uuid
  from public.vehicles v;
  for i in 1..40 loop
    insert into public.fixed_assets (company_id, asset_code, name, category, serial_number, location, department, purchase_date,
        purchase_cost, salvage_value, useful_life_years, annual_rate_percentage, depreciation_method, gl_asset_account,
        gl_expense_account, gl_accum_dep_account, supplier_id)
    values (case when i <= 28 then c_ho else c_dq end, 'FA-EQ-' || lpad(i::text, 3, '0'),
        (array['Hydraulic Vehicle Lift','Wheel Alignment Machine','Diagnostic Scanner','Tyre Changer','Air Compressor','GPS Tracking Server','Workshop Laptop','Fuel Dispenser'])[1 + (i % 8)] || ' #' || i,
        case when i % 8 in (5, 6) then 'IT & GPS Hardware' else 'Workshop Equipment' end, 'SN-EQ-' || lpad(i::text, 5, '0'),
        case when i <= 28 then 'Muscat Workshop' else 'Duqm Workshop' end, 'Workshop & Maintenance',
        date '2025-11-01' + i * 7, 800 + (i % 8) * 900, 50 + (i % 8) * 20, 4, 25, 'Straight-Line', '1530', '5080', '1520',
        v_sup[1 + (i % 60)]);
  end loop;
end $gen$;
