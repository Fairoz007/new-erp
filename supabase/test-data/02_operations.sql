-- =====================================================================
-- Test data phase 2/5: a year of fleet operations.
--   oil changes (~1,600), tyre events (~1,200), maintenance (~1,200),
--   work orders (600, approvals decided / completed through the RPCs),
--   accidents (80), expenses (~6,000, 300 with receipt images),
--   documents (800: registration + insurance PDF per vehicle).
-- Skips itself when oil changes already exist.
-- Run: npx supabase db query --linked -f supabase/test-data/02_operations.sql
-- =====================================================================
do $gen$
declare
  v_admin uuid;
  v record; i int; k int; n int := 0; v_date date; v_odo int; v_sup uuid[]; v_wo uuid; v_req uuid; v_cost numeric;
  v_status text;
  cats text[] := array['General Service','Preventive Maintenance','Brake Service','Suspension','Electrical','AC Repair',
                       'Battery','Filter Change','Wheel Alignment','Body Repair','Engine Repair','Inspection'];
  problems text[] := array['Brake pads worn, squealing on stop','AC not cooling','Engine check light on','Suspension noise on rough road',
                           'Battery not holding charge','Transmission slipping in 3rd gear','Oil leak from sump','Windscreen crack',
                           'Steering vibration at speed','Coolant temperature high','Starter motor failure','Door lock actuator faulty'];
begin
  if exists (select 1 from public.oil_changes) then
    raise notice 'Phase 2 skipped: operations already exist'; return;
  end if;
  perform setseed(0.3026);
  select id into v_admin from auth.users where email = 'superadmin@hakim.com';
  perform set_config('request.jwt.claim.sub', v_admin::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, false);
  perform set_config('request.uid', v_admin::text, false);
  select array_agg(id order by supplier_code) into v_sup from public.suppliers;

  for v in select row_number() over (order by vehicle_code) as rn, * from public.vehicles order by vehicle_code loop
    v_odo := v.current_mileage - 40000 + (v.rn::int % 5000);
    if v_odo < 1000 then v_odo := 1000 + v.rn::int; end if;

    -- Oil changes roughly every 3 months
    for k in 0..3 loop
      v_date := date '2025-11-05' + k * 91 + (v.rn::int % 40);
      exit when v_date > current_date;
      v_odo := v_odo + 7000 + (v.rn::int * 13 % 3000);
      insert into public.oil_changes (company_id, vehicle_id, date, odometer, oil_type, oil_brand, oil_grade, quantity_litres,
          oil_cost, filter_cost, labour_cost, tax, supplier_id, invoice_number, next_oil_change_mileage, next_oil_change_date, performed_by)
      values (v.company_id, v.id, v_date, v_odo, v.oil_config->>'oilType', v.oil_config->>'oilBrand', v.oil_config->>'oilGrade',
          (v.oil_config->>'capacityLitres')::numeric, 18 + (v.rn::int % 6) * 3, 6 + (v.rn::int % 3) * 2, 8, 1.6,
          v_sup[1 + (4 + v.rn::int) % 60], 'OIL-' || v.vehicle_code || '-' || k, v_odo + 10000, v_date + 182,
          'Technician ' || (1 + v.rn::int % 9));
    end loop;

    -- Tyre service events
    for k in 0..2 loop
      v_date := date '2025-11-20' + k * 120 + (v.rn::int % 60);
      exit when v_date > current_date;
      insert into public.tyre_events (company_id, vehicle_id, date, event_type, odometer, positions_affected, cost, supplier_id, technician)
      values (v.company_id, v.id, v_date, (array['Rotation','Alignment','Balancing','Puncture Repair','Replacement'])[1 + (v.rn::int + k) % 5],
          v_odo - 5000 + k * 2000, array['Front Left','Front Right'], 8 + ((v.rn::int + k) % 5) * 12, v_sup[1 + (2 + v.rn::int) % 60],
          'Tyre Bay ' || (1 + k));
    end loop;

    -- Maintenance: 3 per vehicle (10% left Unpaid -> raises a pending supplier invoice via trigger)
    for k in 0..2 loop
      v_date := date '2025-11-10' + k * 115 + (v.rn::int % 70);
      exit when v_date > current_date;
      n := n + 1;
      insert into public.maintenance_records (company_id, record_number, vehicle_id, maintenance_date, maintenance_type, category,
          description, odometer_reading, service_centre, supplier_id, technician, parts_cost, labour_cost, tax, discount,
          other_charges, payment_status, payment_method, next_service_date, next_service_mileage, parts_used)
      values (v.company_id, null, v.id, v_date, (array['Routine','Preventive','Corrective','Breakdown'])[1 + (n % 4)],
          cats[1 + (n % 12)], cats[1 + (n % 12)] || ' performed on ' || v.plate_number, v_odo - 3000 + k * 1500,
          (array['Zubair Automotive','Saud Bahwan Service','Al Jenaibi Workshop','In-house Workshop'])[1 + (n % 4)],
          v_sup[1 + (n % 60)], 'Tech ' || (1 + n % 12), round((40 + random()::numeric * 260)::numeric, 3), round((20 + random()::numeric * 90)::numeric, 3),
          0, 0, 0, case when n % 10 = 0 then 'Unpaid' else 'Paid' end, 'Bank Transfer', v_date + 180, v_odo + 10000,
          jsonb_build_array(jsonb_build_object('id', n, 'partNumber', 'P-' || (1000 + n % 300), 'name', 'Spare part ' || (n % 40),
              'quantity', 1 + n % 3, 'unitPrice', 15 + n % 50, 'tax', 0, 'total', (1 + n % 3) * (15 + n % 50))));
    end loop;

    -- Fuel + other running expenses, monthly
    for k in 0..11 loop
      v_date := date '2025-11-03' + k * 30 + (v.rn::int % 25);
      exit when v_date > current_date;
      insert into public.expenses (company_id, expense_number, vehicle_id, date, category, supplier_id, description, quantity,
          unit_price, tax, payment_method, receipt_number, cost_centre, gl_account_code)
      values (v.company_id, null, v.id, v_date, 'Fuel', v_sup[1 + (6 + v.rn::int) % 60], 'Monthly fuel card - ' || v.plate_number,
          120 + (v.rn::int % 9) * 20, 0.229, 0, 'Fuel Card', 'FC-' || v.vehicle_code || '-' || k, v.department, '5010');
      if (v.rn::int + k) % 4 = 0 then
        insert into public.expenses (company_id, expense_number, vehicle_id, date, category, supplier_id, description, quantity,
            unit_price, tax, payment_method, receipt_number, cost_centre, gl_account_code)
        values (v.company_id, null, v.id, v_date + 2, (array['Toll','Parking','Cleaning','Fines','Driver Expense','Registration'])[1 + (k % 6)],
            null, (array['Highway toll','Airport parking','Vehicle wash','Traffic fine','Driver per diem','Mulkiya renewal'])[1 + (k % 6)],
            1, (array[2.5, 4, 6, 15, 12, 25])[1 + (k % 6)], 0, 'Cash', 'RC-' || v.vehicle_code || '-' || k, v.department,
            (array['5060','5060','5000','5060','5070','5040'])[1 + (k % 6)]);
      end if;
    end loop;

    -- Documents: registration + insurance certificate (files uploaded by the upload step)
    insert into public.documents (company_id, document_name, document_number, category, vehicle_id, issue_date, expiry_date,
        storage_path, file_size, mime_type, notes)
    values (v.company_id, 'Registration Card (Mulkiya) - ' || v.plate_number, v.registration_number, 'Registration', v.id,
            v.registration_expiry_date - 365, v.registration_expiry_date,
            v.company_id || '/documents/' || v.vehicle_code || '-registration.pdf', 2048, 'application/pdf', null),
           (v.company_id, 'Insurance Certificate - ' || v.plate_number, v.insurance_policy_number, 'Insurance', v.id,
            v.insurance_expiry_date - 365, v.insurance_expiry_date,
            v.company_id || '/documents/' || v.vehicle_code || '-insurance.pdf', 2048, 'application/pdf', null);
  end loop;

  -- 150 expense receipts per office with an image attachment
  update public.expenses e set attachment_path = e.company_id || '/expenses/receipt-' || lpad(s.rn::text, 3, '0') || '.jpg'
  from (select id, row_number() over (partition by company_id order by date, id) rn from public.expenses where category <> 'Fuel') s
  where e.id = s.id and s.rn <= 150;

  -- 600 work orders: raised -> approved (decide_approval) -> completed (complete_work_order)
  for i in 1..600 loop
    select * into v from public.vehicles order by vehicle_code offset ((i * 37) % 400) limit 1;
    v_cost := round((60 + random()::numeric * 1400)::numeric, 3);
    v_date := date '2025-11-01' + (i * 359 / 600);
    insert into public.work_orders (company_id, work_order_number, vehicle_id, reported_date, problem_description, requested_by,
        assigned_technician, workshop, supplier_id, priority, status, expected_completion, estimated_cost, parts_charges,
        labour_charges, additional_charges, tax, parts_required)
    values (v.company_id, null, v.id, v_date, problems[1 + (i % 12)], v_admin, 'Tech ' || (1 + i % 12),
        (array['Zubair Automotive','Saud Bahwan Service','Al Jenaibi Workshop','In-house Workshop'])[1 + (i % 4)],
        v_sup[1 + (i % 60)], (array['Low','Medium','High','Critical'])[1 + (i % 4)], 'Requested', v_date + 5, v_cost,
        round(v_cost * 0.6, 3), round(v_cost * 0.35, 3), 0, round(v_cost * 0.05, 3), 'See problem description')
    returning id into v_wo;

    if i <= 560 then   -- most work orders get decided; the last 40 stay open for the approvals queue
      loop   -- one decision per approval level
        select id into v_req from public.approval_requests where reference_id = v_wo and status = 'Pending' limit 1;
        exit when v_req is null;
        perform public.decide_approval(v_req, case when i % 25 = 0 then 'Rejected' else 'Approved' end,
                                       case when i % 25 = 0 then 'Not justified - get second quote' else 'Approved for repair' end);
      end loop;
      select status into v_status from public.work_orders where id = v_wo;
      if i <= 520 and v_status in ('Approved', 'Requested') and i % 25 <> 0 then
        perform public.complete_work_order(v_wo, round(v_cost * (0.85 + random()::numeric * 0.3), 3));
      end if;
    end if;
  end loop;

  -- 80 accidents across the year
  for i in 1..80 loop
    select * into v from public.vehicles order by vehicle_code offset ((i * 53) % 400) limit 1;
    v_cost := round((150 + random()::numeric * 4500)::numeric, 3);
    insert into public.accidents (company_id, accident_number, vehicle_id, accident_date, accident_time, location, driver_name,
        accident_description, accident_type, damage_description, police_report_number, insurance_claim_number,
        estimated_repair_cost, actual_repair_cost, insurance_contribution, company_contribution, third_party_contribution,
        workshop, supplier_id, repair_start_date, repair_completion_date, vehicle_downtime_days, status)
    values (v.company_id, null, v.id, date '2025-11-04' + (i * 355 / 80), time '07:30' + (i * 17 % 600) * interval '1 minute',
        (array['Sultan Qaboos Highway','Duqm Port Road','Muscat Expressway','Sohar Industrial Area','Nizwa Roundabout'])[1 + (i % 5)],
        v.assigned_driver, 'Collision reported by driver', (array['Minor Scrape','Rear-End Collision','Side Impact','Single Vehicle'])[1 + (i % 4)],
        (array['Rear bumper dent','Front grille and headlamp','Door panel scratches','Side mirror broken'])[1 + (i % 4)],
        'ROP-' || (25000 + i), 'CLM-' || (77000 + i), v_cost, case when i % 6 = 0 then 0 else v_cost end,
        case when i % 6 = 0 then 0 else round(v_cost * 0.7, 3) end, case when i % 6 = 0 then 0 else round(v_cost * 0.3, 3) end, 0,
        'Al Jenaibi Workshop', v_sup[1 + (i % 60)], date '2025-11-06' + (i * 355 / 80), date '2025-11-12' + (i * 355 / 80),
        2 + i % 9, (array['Closed','Completed','Under Repair','Insurance Processing','Reported','Closed'])[1 + (i % 6)]);
  end loop;
end $gen$;
