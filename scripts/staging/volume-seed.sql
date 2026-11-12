-- =====================================================================================
--  STAGING ONLY — performance data set at the target volumes of docs/ADVANCE_PROMPT.md
--  NEVER RUN THIS ON PRODUCTION (fpeniljpqigpeqtsgizr).
--
--  Run it through scripts/staging-volume-seed.mjs, which refuses production, sets the
--  guard below and substitutes __SCALE__ (1 = full target volume).
--
--  Target at scale 1: 10 offices, 500 vehicles, 300 employees, 50,000 invoices,
--  ≥ 500,000 journal lines, ≥ 100,000 audit log rows.
--  Every row it creates is marked: office codes VOL01…VOL10, names "Staging volume …",
--  document numbers VOL-…, so the set can be recognised (and removed by dropping those offices
--  on a staging project that is going to be reset anyway).
--
--  Invoices go through the real posting path (post_invoice, record_payment) so the ledger,
--  balances and audit trail are what the app would have produced. Extra manual journals
--  are inserted directly (balanced, posted) to reach the journal-line volume.
-- =====================================================================================
do $seed$
declare
  v_scale numeric := __SCALE__;
  v_admin uuid;
  v_org uuid;
  v_offices int := greatest(1, round(10 * least(v_scale * 10, 1)));   -- 10 offices from scale 0.1 up
  v_vehicles int := ceil(500 * v_scale / v_offices);
  v_employees int := ceil(300 * v_scale / v_offices);
  v_customers int := ceil(200 * v_scale / v_offices);
  v_suppliers int := ceil(100 * v_scale / v_offices);
  v_invoices int := ceil(50000 * v_scale / v_offices);
  v_journals int := ceil(175000 * v_scale / v_offices);
  v_co uuid; v_bank uuid; v_inv uuid; v_je uuid;
  v_party uuid; v_amount numeric; v_date date;
  o int; i int;
begin
  if coalesce(current_setting('app.volume_seed_ok', true), '') <> 'staging' then
    raise exception 'Refusing to run: the staging guard is not set (use scripts/staging-volume-seed.mjs)';
  end if;
  if exists (select 1 from public.companies where code like 'VOL%') then
    raise exception 'The staging volume data set is already present (offices VOL01…)';
  end if;

  select p.id into v_admin from public.profiles p join public.roles r on r.id = p.role_id where r.is_super limit 1;
  if v_admin is null then raise exception 'No Super Admin profile found; complete the Setup Wizard on staging first'; end if;
  -- act as the Super Admin so permission checks and audit rows carry a real user
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.uid', v_admin::text, true);

  select id into v_org from public.organizations limit 1;

  -- HR masters the employee rows refer to (created only if missing)
  insert into public.departments (name) select d from unnest(array['Operations','Workshop','Finance','Admin']) d
   where not exists (select 1 from public.departments x where lower(x.name) = lower(d));
  insert into public.designations (name) select d from unnest(array['Driver','Mechanic','Accountant','Supervisor']) d
   where not exists (select 1 from public.designations x where lower(x.name) = lower(d));

  for o in 1..v_offices loop
    insert into public.companies (name, code, currency, organization_id, active)
    values (format('Staging volume office %s', o), format('VOL%s', lpad(o::text, 2, '0')), 'OMR', v_org, true)
    returning id into v_co;
    insert into public.company_members (user_id, company_id) values (v_admin, v_co) on conflict do nothing;

    insert into public.bank_accounts (company_id, bank_name, account_name, account_number, account_type)
    values (v_co, 'Staging Bank', 'Staging volume operating', format('VOL-%s-001', o), 'Current')
    returning id into v_bank;

    insert into public.vehicles (company_id, plate_number, vehicle_type, vehicle_category, brand, model, fuel_type, transmission, manufacturing_year, current_mileage, status)
    select v_co, format('VOL %s-%s', o, g), (array['Bus','Truck','SUV','Van'])[1 + g % 4], 'Operations', 'Staging', format('Model %s', g % 7),
           'Diesel', 'Automatic', 2015 + g % 10, 10000 + g * 137, 'Active'
      from generate_series(1, v_vehicles) g;

    insert into public.employees (company_id, employee_code, name, designation, department, joining_date, basic_salary)
    select v_co, format('VOL-E-%s-%s', o, g), format('Staging employee %s-%s', o, g), (array['Driver','Mechanic','Accountant','Supervisor'])[1 + g % 4],
           (array['Operations','Workshop','Finance','Admin'])[1 + g % 4], date '2020-01-01' + (g * 11), 250 + (g % 20) * 25
      from generate_series(1, v_employees) g;

    insert into public.customers (office_id, customer_code, customer_type, name, status, payment_terms_days)
    select v_co, format('VOL-C-%s-%s', o, g), 'Corporate', format('Staging customer %s-%s', o, g), 'Active', 30
      from generate_series(1, v_customers) g;
    insert into public.suppliers (office_id, supplier_code, supplier_type, name, status, payment_terms_days)
    select v_co, format('VOL-S-%s-%s', o, g), 'Garage', format('Staging supplier %s-%s', o, g), 'Active', 30
      from generate_series(1, v_suppliers) g;

    -- Invoices: alternating sales and purchase, spread over the last 24 months, posted; 60 % of
    -- sales invoices are (partly) paid. Real RPCs, so totals, ledger and audit rows are genuine.
    for i in 1..v_invoices loop
      v_date := current_date - (i % 730);
      v_amount := round((50 + (i * 7919) % 4950)::numeric, 3);
      if i % 2 = 0 then
        select id into v_party from public.customers where office_id = v_co order by customer_code offset (i % v_customers) limit 1;
        insert into public.invoices (company_id, invoice_number, invoice_type, party_type, customer_id, invoice_date, due_date, reference_number)
        values (v_co, format('VOL-SI-%s-%s', o, i), 'Sales', 'Customer', v_party, v_date, v_date + 30, format('VOL-REF-%s-%s', o, i))
        returning id into v_inv;
        insert into public.invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
        values (v_inv, 1, 'Staging volume service', 1, v_amount, 5, '4010');
      else
        select id into v_party from public.suppliers where office_id = v_co order by supplier_code offset (i % v_suppliers) limit 1;
        insert into public.invoices (company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date, reference_number)
        values (v_co, format('VOL-PI-%s-%s', o, i), 'Purchase', 'Supplier', v_party, v_date, v_date + 30, format('VOL-REF-%s-%s', o, i))
        returning id into v_inv;
        insert into public.invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
        values (v_inv, 1, 'Staging volume parts', 1, v_amount, 5, '5000');
      end if;
      perform public.post_invoice(v_inv);
      if i % 2 = 0 and i % 5 < 3 then
        perform public.record_payment(v_inv, round(v_amount * 1.05 * (case when i % 3 = 0 then 0.5 else 1 end), 3),
                                      v_date + 10, 'Bank Transfer', v_bank);
      end if;
    end loop;

    -- Manual journals (fuel accruals) to reach the target journal-line volume: 2 lines each.
    insert into public.journal_entries (id, company_id, entry_number, date, description, reference, source_module, posted_by, status)
    select gen_random_uuid(), v_co, format('VOL-JV-%s-%s', o, g), current_date - (g % 730), 'Staging volume fuel accrual', 'staging volume', 'Manual', v_admin, 'Posted'
      from generate_series(1, v_journals) g;
    insert into public.journal_lines (entry_id, company_id, account_code, debit, credit, description)
    select e.id, v_co, x.code, x.dr, x.cr, 'Staging volume'
      from public.journal_entries e
      cross join lateral (values ('5010', round((10 + (hashtext(e.entry_number) & 1023))::numeric, 3), 0::numeric),
                                 ('2030', 0::numeric, round((10 + (hashtext(e.entry_number) & 1023))::numeric, 3))) x(code, dr, cr)
     where e.company_id = v_co and e.entry_number like 'VOL-JV-%';
  end loop;

  -- Audit trail: the triggers above already logged every insert. Top up with read-only
  -- "export" events (clearly marked) only if the target of 100,000 rows was not reached.
  insert into public.audit_logs (occurred_at, user_id, company_id, action, entity_type, entity_id, new_value)
  select now() - (g || ' minutes')::interval, v_admin, (select id from public.companies where code = 'VOL01'), 'EXPORT', 'staging_volume', g::text,
         jsonb_build_object('note', 'staging volume filler')
    from generate_series(1, greatest(0, ceil(100000 * v_scale)::int - (select count(*)::int from public.audit_logs))) g;

  raise notice 'Staging volume set: % offices, % vehicles, % employees, % invoices, % journal lines, % audit rows',
    (select count(*) from public.companies where code like 'VOL%'),
    (select count(*) from public.vehicles v join public.companies c on c.id = v.company_id where c.code like 'VOL%'),
    (select count(*) from public.employees e join public.companies c on c.id = e.company_id where c.code like 'VOL%'),
    (select count(*) from public.invoices i join public.companies c on c.id = i.company_id where c.code like 'VOL%'),
    (select count(*) from public.journal_lines l join public.companies c on c.id = l.company_id where c.code like 'VOL%'),
    (select count(*) from public.audit_logs);
end
$seed$;
