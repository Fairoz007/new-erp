-- =====================================================================
-- Fleet operations integrity (Agent A slot). Additive only.
--   * Money totals of maintenance / oil / expense rows are computed by the DB.
--   * Vehicle timeline, odometer and vehicle status side effects are triggers
--     (SECURITY DEFINER) so roles without the 'vehicles' permission (e.g. a
--     Maintenance Manager) can still log work, and the effects are atomic.
--   * Work orders over the approval threshold raise their approval_request
--     inside the same transaction; approval_status can only be changed by a
--     user who may approve (decide_approval already enforces this).
--   * Unpaid maintenance with a supplier raises a *pending* purchase invoice
--     (posted to the GL later by post_invoice) instead of the old unposted
--     "Approved" invoice created by the browser.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DB-computed totals
-- ---------------------------------------------------------------------
create or replace function public.trg_maintenance_total() returns trigger
language plpgsql set search_path = public as $$
begin
  -- rows created by complete_work_order carry the work order's final cost as-is
  if new.work_order_id is null then
    new.total_cost := greatest(0, round(new.parts_cost + new.labour_cost + new.tax + new.other_charges - new.discount, 3));
  end if;
  return new;
end $$;
drop trigger if exists maintenance_records_total on public.maintenance_records;
create trigger maintenance_records_total before insert or update on public.maintenance_records
  for each row execute function public.trg_maintenance_total();

create or replace function public.trg_oil_total() returns trigger
language plpgsql set search_path = public as $$
begin
  new.total_cost := round(new.oil_cost + new.filter_cost + new.labour_cost + new.tax, 3);
  return new;
end $$;
drop trigger if exists oil_changes_total on public.oil_changes;
create trigger oil_changes_total before insert or update on public.oil_changes
  for each row execute function public.trg_oil_total();

create or replace function public.trg_expense_total() returns trigger
language plpgsql set search_path = public as $$
begin
  new.total := round(new.quantity * new.unit_price + new.tax, 3);
  return new;
end $$;
drop trigger if exists expenses_total on public.expenses;
create trigger expenses_total before insert or update on public.expenses
  for each row execute function public.trg_expense_total();

-- ---------------------------------------------------------------------
-- 2. Vehicle lifecycle: timeline + status
-- ---------------------------------------------------------------------
create or replace function public.trg_vehicle_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_value numeric := nullif(new.purchase->>'purchaseValue', '')::numeric;
begin
  insert into public.vehicle_timeline (company_id, vehicle_id, date, title, description, amount, currency, category,
                                       reference_id, reference_type)
  values (new.company_id, new.id, coalesce(nullif(new.purchase->>'purchaseDate', '')::date, current_date),
          'Vehicle Added to Fleet',
          'Acquired ' || new.brand || ' ' || new.model || case when v_value is not null then ' for ' || to_char(v_value, 'FM999999990.000') || ' OMR.' else '.' end,
          v_value, 'OMR', 'Purchase', new.id, 'Vehicle');
  return null;
end $$;
drop trigger if exists vehicles_timeline_ins on public.vehicles;
create trigger vehicles_timeline_ins after insert on public.vehicles
  for each row execute function public.trg_vehicle_after_insert();

create or replace function public.trg_vehicle_after_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.vehicle_timeline (company_id, vehicle_id, date, title, description, category, reference_id, reference_type)
  values (new.company_id, new.id, current_date, 'Status: ' || new.status,
          'Vehicle status changed from ' || old.status || ' to ' || new.status || '.', 'Status', new.id, 'Vehicle');
  return null;
end $$;
drop trigger if exists vehicles_timeline_status on public.vehicles;
create trigger vehicles_timeline_status after update of status on public.vehicles
  for each row when (old.status is distinct from new.status)
  execute function public.trg_vehicle_after_status();

-- ---------------------------------------------------------------------
-- 3. Maintenance: odometer, timeline, pending purchase invoice
-- ---------------------------------------------------------------------
create or replace function public.trg_maintenance_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_net numeric; v_terms int; v_inv uuid; v_rate numeric; v_split boolean;
begin
  if new.odometer_reading is not null then
    update public.vehicles set current_mileage = new.odometer_reading
    where id = new.vehicle_id and current_mileage < new.odometer_reading;
  end if;

  insert into public.vehicle_timeline (company_id, vehicle_id, date, title, description, amount, currency, category,
                                       reference_id, reference_type)
  values (new.company_id, new.vehicle_id, new.maintenance_date, new.category || ': ' || new.maintenance_type,
          new.description, new.total_cost, 'OMR', 'Maintenance', new.id, 'MaintenanceRecord');

  -- Unpaid supplier work becomes a purchase invoice awaiting approval; "Paid" work is settled elsewhere
  -- (record the payment / expense), so no payable is created for it.
  if new.supplier_id is not null and new.payment_status <> 'Paid' and new.total_cost > 0 then
    v_net := new.total_cost - new.tax;
    if v_net > 0 then
      select payment_terms_days into v_terms from public.suppliers where id = new.supplier_id;
      v_terms := coalesce(v_terms, 30);
      v_rate := least(100, round(new.tax / v_net * 100, 2));
      -- the rate column has 2 decimals: when it cannot reproduce the charged tax exactly, carry the tax as its own line
      v_split := abs(round(v_net * v_rate / 100, 3) - new.tax) > 0.0005;
      if v_split then v_rate := 0; end if;
      insert into public.invoices (company_id, invoice_number, invoice_type, party_type, supplier_id, invoice_date, due_date,
                                   reference_number, work_order_id, maintenance_record_id, vehicle_id, currency,
                                   payment_terms_days, approval_status, notes)
      values (new.company_id,
              public.next_doc_number(new.company_id, 'PINV-' || extract(year from new.maintenance_date)::int, 4),
              'Purchase', 'Supplier', new.supplier_id, new.maintenance_date, new.maintenance_date + v_terms,
              new.invoice_number, new.work_order_id, new.id, new.vehicle_id, 'OMR', v_terms, 'Pending Approval',
              'Auto-raised from maintenance record ' || new.record_number)
      returning id into v_inv;
      insert into public.invoice_lines (invoice_id, line_no, item_code, description, quantity, unit, unit_price,
                                        tax_rate_percentage, vehicle_id, expense_category, gl_account_code)
      values (v_inv, 1, 'MNT-SRV', new.category || ' - ' || new.description, 1, 'Job', v_net, v_rate,
              new.vehicle_id, 'Maintenance', '5000');
      if v_split then
        insert into public.invoice_lines (invoice_id, line_no, item_code, description, quantity, unit, unit_price,
                                          tax_rate_percentage, vehicle_id, expense_category, gl_account_code)
        values (v_inv, 2, 'MNT-TAX', 'Tax as charged by supplier', 1, 'Job', new.tax, 0,
                new.vehicle_id, 'Maintenance', '5000');
      end if;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists maintenance_records_after_ins on public.maintenance_records;
create trigger maintenance_records_after_ins after insert on public.maintenance_records
  for each row execute function public.trg_maintenance_after_insert();

-- ---------------------------------------------------------------------
-- 4. Oil change / tyre event / expense: timeline (+ odometer)
-- ---------------------------------------------------------------------
create or replace function public.trg_oil_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.vehicles set current_mileage = new.odometer
  where id = new.vehicle_id and current_mileage < new.odometer;
  insert into public.vehicle_timeline (company_id, vehicle_id, date, title, description, amount, currency, category,
                                       reference_id, reference_type)
  values (new.company_id, new.vehicle_id, new.date,
          'Oil Change: ' || coalesce(new.oil_brand, '') || ' ' || coalesce(new.oil_grade, ''),
          'Replaced ' || coalesce(new.quantity_litres::text, '0') || 'L engine oil and filter at ' || new.odometer || ' KM.'
            || case when new.next_oil_change_mileage is not null then ' Next due at ' || new.next_oil_change_mileage || ' KM.' else '' end,
          new.total_cost, 'OMR', 'Oil', new.id, 'OilChange');
  return null;
end $$;
drop trigger if exists oil_changes_after_ins on public.oil_changes;
create trigger oil_changes_after_ins after insert on public.oil_changes
  for each row execute function public.trg_oil_after_insert();

create or replace function public.trg_tyre_event_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.vehicle_timeline (company_id, vehicle_id, date, title, description, amount, currency, category,
                                       reference_id, reference_type)
  values (new.company_id, new.vehicle_id, new.date, 'Tyre Event: ' || new.event_type,
          new.event_type || ' performed on positions: ' || array_to_string(new.positions_affected, ', ') || '.',
          new.cost, 'OMR', 'Tyre', new.id, 'TyreEvent');
  return null;
end $$;
drop trigger if exists tyre_events_after_ins on public.tyre_events;
create trigger tyre_events_after_ins after insert on public.tyre_events
  for each row execute function public.trg_tyre_event_after_insert();

create or replace function public.trg_expense_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.vehicle_id is not null then
    insert into public.vehicle_timeline (company_id, vehicle_id, date, title, description, amount, currency, category,
                                         reference_id, reference_type)
    values (new.company_id, new.vehicle_id, new.date, new.category || ' Expense: ' || new.description,
            'Payment via ' || new.payment_method || coalesce('. Cost Centre: ' || new.cost_centre, ''),
            new.total, 'OMR', 'Expense', new.id, 'Expense');
  end if;
  return null;
end $$;
drop trigger if exists expenses_after_ins on public.expenses;
create trigger expenses_after_ins after insert on public.expenses
  for each row execute function public.trg_expense_after_insert();

-- ---------------------------------------------------------------------
-- 5. Accidents: vehicle status + timeline
-- ---------------------------------------------------------------------
create or replace function public.trg_accident_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status not in ('Completed', 'Closed') then
    update public.vehicles set status = 'Accident'
    where id = new.vehicle_id and status not in ('Sold', 'Scrapped', 'Accident');
  end if;
  insert into public.vehicle_timeline (company_id, vehicle_id, date, title, description, amount, currency, category,
                                       reference_id, reference_type)
  values (new.company_id, new.vehicle_id, new.accident_date, 'Accident Reported: ' || new.accident_type,
          coalesce(new.damage_description, '') || case when coalesce(new.police_report_number, '') <> ''
            then ' | Police Report: ' || new.police_report_number else '' end,
          new.actual_repair_cost, 'OMR', 'Accident', new.id, 'Accident');
  return null;
end $$;
drop trigger if exists accidents_after_ins on public.accidents;
create trigger accidents_after_ins after insert on public.accidents
  for each row execute function public.trg_accident_after_insert();

-- A closed/completed accident releases the vehicle, unless another accident is still open.
create or replace function public.trg_accident_after_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('Completed', 'Closed')
     and not exists (select 1 from public.accidents a
                     where a.vehicle_id = new.vehicle_id and a.id <> new.id and a.status not in ('Completed', 'Closed')) then
    update public.vehicles set status = 'Active' where id = new.vehicle_id and status = 'Accident';
  elsif new.status not in ('Completed', 'Closed') then
    update public.vehicles set status = 'Accident' where id = new.vehicle_id and status in ('Active', 'Under Maintenance', 'Reserved', 'Inactive');
  end if;
  return null;
end $$;
drop trigger if exists accidents_after_status on public.accidents;
create trigger accidents_after_status after update of status on public.accidents
  for each row when (old.status is distinct from new.status)
  execute function public.trg_accident_after_status();

-- ---------------------------------------------------------------------
-- 6. Work orders: approval request + guards
-- ---------------------------------------------------------------------
create or replace function public.trg_wo_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.approval_rules
             where module = 'maintenance' and active and threshold_amount <= new.estimated_cost) then
    new.approval_status := 'Pending';   -- the client cannot opt out of a matching approval rule
  end if;
  if new.status = 'Completed' then
    raise exception 'A work order cannot be created as Completed';
  end if;
  return new;
end $$;
drop trigger if exists work_orders_before_ins on public.work_orders;
create trigger work_orders_before_ins before insert on public.work_orders
  for each row execute function public.trg_wo_before_insert();

create or replace function public.trg_wo_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.approval_rules;
begin
  if new.approval_status = 'Pending' then
    select * into r from public.approval_rules
    where module = 'maintenance' and active and threshold_amount <= new.estimated_cost
    order by threshold_amount desc limit 1;
    if found then
    insert into public.approval_requests (company_id, reference_type, reference_id, reference_number, requested_by,
                                          amount, currency, total_levels, required_roles, notes)
    values (new.company_id, 'WorkOrder', new.id, new.work_order_number, coalesce(auth.uid(), new.requested_by),
            new.estimated_cost, 'OMR', greatest(1, cardinality(r.required_roles)), r.required_roles,
            'Work order estimated cost (' || to_char(new.estimated_cost, 'FM999999990.000') || ' OMR) reaches the approval threshold of '
              || to_char(r.threshold_amount, 'FM999999990.000') || ' OMR.');
    end if;
  end if;
  return null;
end $$;
drop trigger if exists work_orders_after_ins on public.work_orders;
create trigger work_orders_after_ins after insert on public.work_orders
  for each row execute function public.trg_wo_after_insert();

create or replace function public.trg_wo_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- approval_status is decided through approvals (decide_approval), never edited directly
  if new.approval_status is distinct from old.approval_status and auth.uid() is not null
     and not public.can_approve('maintenance', new.estimated_cost) then
    raise exception 'Permission denied: only an approver may change the approval status';
  end if;
  -- work cannot move forward while its approval is pending or rejected
  if new.status is distinct from old.status
     and new.status in ('Approved', 'Scheduled', 'In Progress', 'Waiting for Parts')   -- 'Completed' is enforced by the table CHECK
     and new.approval_status in ('Pending', 'Rejected') then
    raise exception 'Work order % requires approval before it can move to %', new.work_order_number, new.status;
  end if;
  return new;
end $$;
drop trigger if exists work_orders_guard on public.work_orders;
create trigger work_orders_guard before update on public.work_orders
  for each row execute function public.trg_wo_guard();

-- ---------------------------------------------------------------------
-- 7. A fleet row must belong to the same office as its vehicle
--    (RLS only checks the row's own company_id; this stops cross-office links).
-- ---------------------------------------------------------------------
create or replace function public.trg_same_company_as_vehicle() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  if new.vehicle_id is not null then
    select company_id into v_company from public.vehicles where id = new.vehicle_id;
    if v_company is distinct from new.company_id then
      raise exception 'The vehicle belongs to a different office than this record';
    end if;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['tyres','tyre_events','oil_changes','work_orders','maintenance_records','accidents','expenses']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_same_company', t);
    execute format('create trigger %I before insert or update of vehicle_id, company_id on public.%I
                    for each row execute function public.trg_same_company_as_vehicle()', t || '_same_company', t);
  end loop;
end $$;
