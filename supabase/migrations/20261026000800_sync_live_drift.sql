-- =====================================================================
-- Live-schema drift sync. Several applied migrations (000100 fleet, 000200 finance,
-- 000600 auth) were edited after they had been pushed; applied migrations never
-- re-run, so the linked project kept the old code. Found by fingerprinting every
-- function/trigger/policy/constraint/column/view/index/grant on the live project
-- against a database built from the migration files.
--   * 19 functions re-created with their current definitions (incl. create_credit_note,
--     whose old version could credit 0.001 OMR more than the open balance)
--   * trg_same_company_as_vehicle() and its 7 triggers were missing
--   * write grants that Supabase's default privileges gave `authenticated` on views,
--     profiles, approval_requests, notification_reads and the sequence tables are
--     revoked (RLS already blocked them; this matches the migrations exactly)
-- Idempotent: create or replace / drop if exists / revoke.
-- =====================================================================

-- from 20261026000200_finance.sql
create or replace function public.create_credit_note(p_invoice uuid, p_reason text, p_amount numeric default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.invoices; v_amount numeric; v_ratio numeric; v_id uuid; v_total numeric;
        v_ids uuid[]; v_up numeric[]; v_rate numeric[]; v_max int;
begin
  select * into inv from public.invoices where id = p_invoice for update;   -- serialize concurrent credit notes
  if not found then raise exception 'Invoice not found'; end if;
  if not public.has_company_access(inv.company_id) or not public.has_perm('invoices', 'create') then
    raise exception 'Permission denied';
  end if;
  if inv.is_credit_note then raise exception 'Cannot credit a credit note'; end if;
  if inv.approval_status <> 'Approved' or inv.journal_entry_id is null then
    raise exception 'Only approved (posted) invoices can be credited; cancel the draft instead';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required for a credit note'; end if;
  if inv.outstanding_amount <= 0.0005 then raise exception 'Invoice has no outstanding amount to credit'; end if;

  v_amount := round(coalesce(p_amount, inv.outstanding_amount), 3);
  if v_amount <= 0 then raise exception 'Credit amount must be greater than zero'; end if;
  if v_amount > inv.outstanding_amount + 0.0005 then
    raise exception 'Credit amount % exceeds outstanding %', v_amount, inv.outstanding_amount;
  end if;
  if not public.can_approve('invoice', v_amount) then
    raise exception 'Permission denied: credit notes of this amount need invoice approval authority';
  end if;

  insert into public.invoices (company_id, invoice_number, invoice_type, party_type, supplier_id, customer_id,
      party_snapshot, invoice_date, due_date, reference_number, purchase_order_number, vehicle_id, cost_centre,
      currency, exchange_rate, payment_terms_days, notes, is_credit_note, parent_invoice_id, payment_status)
  values (inv.company_id, null, inv.invoice_type, inv.party_type, inv.supplier_id, inv.customer_id,
      inv.party_snapshot, current_date, current_date, inv.invoice_number, inv.purchase_order_number, inv.vehicle_id,
      inv.cost_centre, inv.currency, inv.exchange_rate, 0,
      'Credit note against ' || inv.invoice_number || '. Reason: ' || trim(p_reason), true, inv.id, 'Paid')
  returning id into v_id;

  v_ratio := v_amount / inv.grand_total;
  if v_ratio >= 0.9999995 then
    -- full credit of an untouched invoice: exact copy of the lines
    insert into public.invoice_lines (invoice_id, line_no, item_code, description, quantity, unit, unit_price,
        discount_percentage, tax_rate_percentage, vehicle_id, expense_category, gl_account_code, cost_centre)
    select v_id, line_no, item_code, 'Credit: ' || description, quantity, unit, unit_price,
           discount_percentage, tax_rate_percentage, vehicle_id, expense_category, gl_account_code, cost_centre
    from public.invoice_lines where invoice_id = p_invoice;
  else
    -- partial credit: one line per parent line carrying its pro-rata share (same tax rate, so VAT is
    -- reversed pro rata). Net prices are floored, then trimmed so the total never exceeds the requested
    -- amount; any remaining baisa go on a zero-VAT rounding line so the credit equals the amount exactly.
    select array_agg(id order by line_no),
           array_agg(floor(line_total * v_ratio / (1 + tax_rate_percentage / 100) * 1000) / 1000 order by line_no),
           array_agg(tax_rate_percentage order by line_no)
      into v_ids, v_up, v_rate
      from public.invoice_lines where invoice_id = p_invoice;
    loop
      v_total := 0;
      for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
        v_total := v_total + round(v_up[i] * (1 + v_rate[i] / 100), 3);
      end loop;
      exit when v_total <= v_amount + 0.0005;
      v_max := 1;
      for i in 2 .. array_length(v_ids, 1) loop
        if v_up[i] > v_up[v_max] then v_max := i; end if;
      end loop;
      v_up[v_max] := v_up[v_max] - 0.001;
    end loop;
    for i in 1 .. coalesce(array_length(v_ids, 1), 0) loop
      if v_up[i] > 0 then
        insert into public.invoice_lines (invoice_id, line_no, item_code, description, quantity, unit, unit_price,
            discount_percentage, tax_rate_percentage, vehicle_id, expense_category, gl_account_code, cost_centre)
        select v_id, i, item_code, 'Credit (pro rata): ' || description, 1, unit, v_up[i], 0, v_rate[i],
               vehicle_id, expense_category, gl_account_code, cost_centre
        from public.invoice_lines where id = v_ids[i];
      end if;
    end loop;
    if v_amount - v_total >= 0.0005 then
      insert into public.invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage,
          gl_account_code, cost_centre)
      select v_id, coalesce(array_length(v_ids, 1), 0) + 1, 'Credit rounding adjustment', 1, round(v_amount - v_total, 3), 0,
             gl_account_code, cost_centre
      from public.invoice_lines where id = v_ids[1];
    end if;
  end if;

  select grand_total into v_total from public.invoices where id = v_id;
  if v_total <= 0 then raise exception 'Credit amount is too small'; end if;

  perform public.post_invoice(v_id);
  return v_id;
end $$;

-- from 20261026000600_auth.sql
create or replace function public.guard_company_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_target uuid := coalesce(new.user_id, old.user_id);
begin
  if auth.uid() is not null and not public.is_super_admin()
     and exists (select 1 from public.profiles p where p.id = v_target and p.role = 'Super Admin') then
    raise exception 'Permission denied: only a Super Admin can change a Super Admin''s offices';
  end if;
  return coalesce(new, old);
end $$;

-- from 20261026000600_auth.sql
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_admin boolean;
  v_super boolean;
begin
  new.updated_at := now();

  -- Server-side (SQL editor / service role): unrestricted, used to bootstrap the first Super Admin.
  if v_uid is null then
    return new;
  end if;

  -- Identity columns are never client-editable (email mirrors auth.users and is shown to other users).
  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.legacy_id is distinct from old.legacy_id then
    raise exception 'Permission denied: id, email and legacy_id cannot be changed from the app';
  end if;

  if new.role is not distinct from old.role and new.status is not distinct from old.status then
    -- Only name / department / phone / avatar changed. Editing someone else's profile still needs admin rights,
    -- which the profiles_update policy already enforces; apply the same office scoping as for role changes.
    if old.id <> v_uid and not public.is_super_admin() then
      if not exists (select 1 from public.company_members m where m.user_id = old.id)
         or exists (select 1 from public.company_members m
                    where m.user_id = old.id and public.has_company_access(m.company_id)) then
        return new;
      end if;
      raise exception 'Permission denied: user belongs to an office you do not manage';
    end if;
    return new;
  end if;

  -- Role or status change from here on.
  v_admin := public.has_perm('users-roles', 'edit');
  v_super := public.is_super_admin();

  if not v_admin then
    raise exception 'Only administrators can change role or status';
  end if;

  if not v_super then
    if old.id = v_uid then
      raise exception 'Permission denied: you cannot change your own role or status';
    end if;
    if new.role = 'Super Admin' or old.role = 'Super Admin' then
      raise exception 'Permission denied: only a Super Admin can grant, change or revoke Super Admin';
    end if;
    -- Company Admins manage users of their own offices, plus not-yet-assigned users (fresh invitees).
    if exists (select 1 from public.company_members m where m.user_id = old.id)
       and not exists (select 1 from public.company_members m
                       where m.user_id = old.id and public.has_company_access(m.company_id)) then
      raise exception 'Permission denied: user belongs to an office you do not manage';
    end if;
  end if;

  -- Never leave the system without an active Super Admin.
  if old.role = 'Super Admin' and old.status = 'active'
     and (new.role is distinct from 'Super Admin' or new.status <> 'active')
     and not exists (select 1 from public.profiles p
                     where p.role = 'Super Admin' and p.status = 'active' and p.id <> old.id) then
    raise exception 'Cannot demote or deactivate the last active Super Admin';
  end if;

  return new;
end $$;

-- from 20261026000600_auth.sql
create or replace function public.set_user_companies(p_user uuid, p_companies uuid[])
returns setof uuid
language plpgsql security invoker set search_path = public as $$
begin
  if not public.has_perm('users-roles', 'edit') then
    raise exception 'Permission denied';
  end if;

  delete from public.company_members
   where user_id = p_user and not (company_id = any(coalesce(p_companies, '{}')));

  -- Insert only new rows: INSERT ... ON CONFLICT still applies the insert policy to existing rows,
  -- which would reject keeping a membership in an office the caller does not manage.
  insert into public.company_members (user_id, company_id)
  select distinct p_user, c from unnest(coalesce(p_companies, '{}')) as c
  where not exists (select 1 from public.company_members m where m.user_id = p_user and m.company_id = c)
  on conflict (user_id, company_id) do nothing;

  -- Every requested office must now be a membership (an RLS-filtered insert raises; this is a belt-and-braces check).
  if exists (select 1 from unnest(coalesce(p_companies, '{}')) c
             where not exists (select 1 from public.company_members m where m.user_id = p_user and m.company_id = c)) then
    raise exception 'Permission denied: you cannot assign an office you do not manage';
  end if;

  return query select company_id from public.company_members where user_id = p_user;
end $$;

-- from 20261026000200_finance.sql
create or replace function public.submit_invoice(p_invoice uuid) returns text
language plpgsql security definer set search_path = public as $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Invoice not found'; end if;
  if not public.has_company_access(inv.company_id)
     or not (public.has_perm('invoices', 'create') or public.has_perm('invoices', 'edit')) then
    raise exception 'Permission denied';
  end if;
  if inv.is_credit_note then raise exception 'Credit notes are posted when they are created'; end if;
  -- 'Pending Approval' without an open request = raised by a system trigger (e.g. maintenance, Agent A)
  if inv.approval_status not in ('Draft','Rejected','Pending Approval') or inv.journal_entry_id is not null then
    raise exception 'Invoice is % and cannot be submitted', inv.approval_status;
  end if;
  if exists (select 1 from public.approval_requests
             where reference_type = 'Invoice' and reference_id = p_invoice and status = 'Pending') then
    raise exception 'Invoice is already awaiting approval; decide it in Approvals';
  end if;
  return public.fin_submit_invoice(p_invoice);
end $$;

-- from 20261026000100_fleet.sql
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

-- from 20261026000100_fleet.sql
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

-- from 20261026000100_fleet.sql
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

-- from 20261026000100_fleet.sql
create or replace function public.trg_expense_total() returns trigger
language plpgsql set search_path = public as $$
begin
  new.total := round(new.quantity * new.unit_price + new.tax, 3);
  return new;
end $$;

-- from 20261026000100_fleet.sql
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

-- from 20261026000100_fleet.sql
create or replace function public.trg_maintenance_total() returns trigger
language plpgsql set search_path = public as $$
begin
  -- rows created by complete_work_order carry the work order's final cost as-is
  if new.work_order_id is null then
    new.total_cost := greatest(0, round(new.parts_cost + new.labour_cost + new.tax + new.other_charges - new.discount, 3));
  end if;
  return new;
end $$;

-- from 20261026000100_fleet.sql
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

-- from 20261026000100_fleet.sql
create or replace function public.trg_oil_total() returns trigger
language plpgsql set search_path = public as $$
begin
  new.total_cost := round(new.oil_cost + new.filter_cost + new.labour_cost + new.tax, 3);
  return new;
end $$;

-- from 20261026000100_fleet.sql
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

-- from 20261026000100_fleet.sql
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

-- from 20261026000100_fleet.sql
create or replace function public.trg_vehicle_after_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.vehicle_timeline (company_id, vehicle_id, date, title, description, category, reference_id, reference_type)
  values (new.company_id, new.id, current_date, 'Status: ' || new.status,
          'Vehicle status changed from ' || old.status || ' to ' || new.status || '.', 'Status', new.id, 'Vehicle');
  return null;
end $$;

-- from 20261026000100_fleet.sql
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

-- from 20261026000100_fleet.sql
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

-- from 20261026000100_fleet.sql
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

-- from 20261026000100_fleet.sql
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

-- same-office guard triggers (from 20261026000100_fleet.sql)
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

-- grants that exist only on the live project
revoke insert, update, delete on public.v_account_balances, public.v_bank_balances, public.v_invoice_aging,
  public.v_party_balances, public.v_party_summary from authenticated;
revoke insert, delete on public.profiles from authenticated;
revoke update, delete on public.approval_requests from authenticated;
revoke update on public.notification_reads from authenticated;
revoke select on public.doc_sequences, public.global_doc_sequences from authenticated;
