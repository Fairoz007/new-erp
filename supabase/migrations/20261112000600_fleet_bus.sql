-- Phase 5: bus-first fleet.
--   * vehicles: route permit, inspection dates, route name, contract (client) and driver assignment.
--     Seats default from the vehicle type.
--   * drivers: a driver is an employee with a licence (number, class, expiry). The office follows the
--     employee. A driver drives at most one vehicle at a time, in the same office, with a valid licence.
--   * expiry alerts: registration, insurance, permit, inspection, driver licence, service due.
--     The alert window is an organization setting (expiry_alert_days).
--   * v_fleet_expiries: one row per upcoming/overdue date, for the dashboard (RLS of the base tables).

-- ---------------------------------------------------------------------
-- 1. Organization setting
-- ---------------------------------------------------------------------
alter table public.organizations add column if not exists expiry_alert_days integer not null default 30
  check (expiry_alert_days between 1 and 365);

-- ---------------------------------------------------------------------
-- 2. Drivers
-- ---------------------------------------------------------------------
create table if not exists public.drivers (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete restrict,
  employee_id          uuid not null unique references public.employees(id) on delete restrict,
  display_name         text not null default '',
  licence_number       text not null check (btrim(licence_number) <> ''),
  licence_class        text,
  licence_issue_date   date,
  licence_expiry_date  date not null,
  status               text not null default 'Active' check (status in ('Active', 'Suspended', 'Inactive')),
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (licence_issue_date is null or licence_issue_date <= licence_expiry_date)
);
create index if not exists drivers_company on public.drivers (company_id);
create unique index if not exists drivers_licence_unique on public.drivers (public.norm_ident(licence_number));

-- Office and name always come from the employee (so a driver cannot be moved on its own).
create or replace function public.trg_driver_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
declare e record;
begin
  select company_id, name, status into e from public.employees where id = new.employee_id;
  if not found then raise exception 'Employee not found'; end if;
  if tg_op = 'INSERT' and e.status = 'Terminated' then raise exception 'A terminated employee cannot be registered as a driver'; end if;
  if tg_op = 'UPDATE' and new.employee_id is distinct from old.employee_id then
    raise exception 'A driver record cannot be moved to another employee';
  end if;
  -- the employee's office decides; a user must be allowed to manage drivers there
  if tg_op = 'INSERT' and auth.uid() is not null and not public.can_in(e.company_id, 'drivers', 'create') then
    raise exception 'You cannot add drivers in this employee''s office';
  end if;
  new.company_id := e.company_id;
  new.display_name := e.name;
  new.licence_number := btrim(new.licence_number);
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.trg_driver_defaults() from anon, authenticated, public;
drop trigger if exists a_driver_defaults on public.drivers;
create trigger a_driver_defaults before insert or update on public.drivers
  for each row execute function public.trg_driver_defaults();

create or replace function public.trg_driver_unique_licence() returns trigger
language plpgsql set search_path = public as $$
declare v text;
begin
  select display_name into v from public.drivers
   where public.norm_ident(licence_number) = public.norm_ident(new.licence_number) and id <> new.id;
  if found then raise exception 'Licence number % is already registered to %', new.licence_number, v; end if;
  return new;
end $$;
drop trigger if exists b_driver_unique_licence on public.drivers;
create trigger b_driver_unique_licence before insert or update of licence_number on public.drivers
  for each row execute function public.trg_driver_unique_licence();

-- An employee's office move (transfer_to_office) or rename is copied to the driver record, and the
-- driver leaves any vehicle in the old office.
create or replace function public.trg_employee_driver_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.company_id is distinct from old.company_id or new.name is distinct from old.name then
    update public.drivers set company_id = new.company_id, display_name = new.name where employee_id = new.id;
  end if;
  if new.company_id is distinct from old.company_id then
    update public.vehicles set driver_id = null
     where driver_id in (select id from public.drivers where employee_id = new.id) and company_id <> new.company_id;
  end if;
  if new.status = 'Terminated' and old.status <> 'Terminated' then
    update public.drivers set status = 'Inactive' where employee_id = new.id;
    update public.vehicles set driver_id = null where driver_id in (select id from public.drivers where employee_id = new.id);
  end if;
  return new;
end $$;
revoke execute on function public.trg_employee_driver_sync() from anon, authenticated, public;
drop trigger if exists employees_driver_sync on public.employees;
create trigger employees_driver_sync after update of company_id, name, status on public.employees
  for each row execute function public.trg_employee_driver_sync();

alter table public.drivers enable row level security;
alter table public.drivers force row level security;
grant select, insert, update, delete on public.drivers to authenticated;
drop policy if exists drivers_select on public.drivers;
create policy drivers_select on public.drivers for select to authenticated
  using (company_id = any((select public.perm_company_ids('drivers', 'view'))::uuid[]));
drop policy if exists drivers_insert on public.drivers;
create policy drivers_insert on public.drivers for insert to authenticated
  with check (company_id = any((select public.perm_company_ids('drivers', 'create'))::uuid[]));
drop policy if exists drivers_update on public.drivers;
create policy drivers_update on public.drivers for update to authenticated
  using (company_id = any((select public.perm_company_ids('drivers', 'edit'))::uuid[]))
  with check (company_id = any((select public.perm_company_ids('drivers', 'edit'))::uuid[]));
drop policy if exists drivers_delete on public.drivers;
create policy drivers_delete on public.drivers for delete to authenticated
  using (company_id = any((select public.perm_company_ids('drivers', 'delete'))::uuid[]));
drop trigger if exists drivers_audit on public.drivers;
create trigger drivers_audit after insert or update or delete on public.drivers for each row execute function public.trg_audit();

-- ---------------------------------------------------------------------
-- 3. Vehicle bus fields and assignments
-- ---------------------------------------------------------------------
alter table public.vehicles add column if not exists permit_number        text;
alter table public.vehicles add column if not exists permit_expiry_date   date;
alter table public.vehicles add column if not exists last_inspection_date date;
alter table public.vehicles add column if not exists next_inspection_date date;
alter table public.vehicles add column if not exists route_name           text;
alter table public.vehicles add column if not exists contract_id          uuid references public.contracts(id) on delete set null;
alter table public.vehicles add column if not exists driver_id            uuid references public.drivers(id) on delete set null;
do $$ begin
  alter table public.vehicles add constraint vehicles_inspection_order
    check (next_inspection_date is null or last_inspection_date is null or next_inspection_date >= last_inspection_date);
exception when duplicate_object then null; end $$;
create unique index if not exists vehicles_one_driver on public.vehicles (driver_id) where driver_id is not null;
create index if not exists vehicles_contract on public.vehicles (contract_id) where contract_id is not null;

-- Named w_… so it runs after vehicles_type_sync has resolved vehicle_type_id.
create or replace function public.trg_vehicle_assignments() returns trigger
language plpgsql security definer set search_path = public as $$
declare d record; c record; v_moving boolean := coalesce(current_setting('erp.office_transfer', true), '') = 'on';
begin
  -- seats default from the vehicle type
  if new.number_of_seats is null and new.vehicle_type_id is not null then
    select seat_capacity into new.number_of_seats from public.vehicle_types where id = new.vehicle_type_id;
  end if;

  if new.driver_id is not null then
    select * into d from public.drivers where id = new.driver_id;
    if d.company_id <> new.company_id then
      if v_moving then new.driver_id := null;            -- transfer: the old office's driver stays behind
      else raise exception 'The driver % belongs to another office', d.display_name; end if;
    elsif tg_op = 'INSERT' or new.driver_id is distinct from old.driver_id then
      if d.status <> 'Active' then raise exception 'Driver % is %', d.display_name, lower(d.status); end if;
      if d.licence_expiry_date < current_date then
        raise exception 'The licence of % expired on %', d.display_name, to_char(d.licence_expiry_date, 'YYYY-MM-DD');
      end if;
      if exists (select 1 from public.vehicles where driver_id = new.driver_id and id <> new.id) then
        raise exception 'Driver % is already assigned to %', d.display_name,
          (select plate_number from public.vehicles where driver_id = new.driver_id and id <> new.id limit 1);
      end if;
    end if;
  end if;

  if new.contract_id is not null then
    select * into c from public.contracts where id = new.contract_id;
    if c.company_id <> new.company_id then
      if v_moving then new.contract_id := null;
      else raise exception 'The contract % belongs to another office', c.contract_number; end if;
    elsif c.party_type <> 'Customer' then
      raise exception 'Vehicles can only be assigned to client contracts';
    elsif (tg_op = 'INSERT' or new.contract_id is distinct from old.contract_id) and c.status not in ('Draft', 'Active') then
      raise exception 'Contract % is %', c.contract_number, lower(c.status);
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.trg_vehicle_assignments() from anon, authenticated, public;
drop trigger if exists w_vehicle_assignments on public.vehicles;
create trigger w_vehicle_assignments before insert or update on public.vehicles
  for each row execute function public.trg_vehicle_assignments();

-- Keep the legacy text column and employees.assigned_vehicle_id in step with the driver link.
create or replace function public.trg_vehicle_driver_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.driver_id is not null and old.driver_id is distinct from new.driver_id then
    update public.employees e set assigned_vehicle_id = null
      from public.drivers d where d.id = old.driver_id and e.id = d.employee_id and e.assigned_vehicle_id = new.id;
  end if;
  if new.driver_id is not null and (tg_op = 'INSERT' or new.driver_id is distinct from old.driver_id) then
    update public.employees e set assigned_vehicle_id = new.id
      from public.drivers d where d.id = new.driver_id and e.id = d.employee_id;
  end if;
  return null;
end $$;
revoke execute on function public.trg_vehicle_driver_sync() from anon, authenticated, public;
drop trigger if exists vehicles_driver_sync on public.vehicles;
create trigger vehicles_driver_sync after insert or update of driver_id on public.vehicles
  for each row execute function public.trg_vehicle_driver_sync();

create or replace function public.trg_vehicle_driver_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.driver_id is not null then
    select display_name into new.assigned_driver from public.drivers where id = new.driver_id;
  elsif tg_op = 'UPDATE' and old.driver_id is not null then
    new.assigned_driver := null;
  end if;
  return new;
end $$;
revoke execute on function public.trg_vehicle_driver_name() from anon, authenticated, public;
drop trigger if exists w_vehicle_driver_name on public.vehicles;
create trigger w_vehicle_driver_name before insert or update on public.vehicles
  for each row execute function public.trg_vehicle_driver_name();

-- A driver's rename (from the employee) reaches the vehicle's display column.
create or replace function public.trg_driver_name_to_vehicle() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.display_name is distinct from old.display_name then
    update public.vehicles set assigned_driver = new.display_name where driver_id = new.id;
  end if;
  if new.status <> 'Active' and old.status = 'Active' then
    update public.vehicles set driver_id = null where driver_id = new.id;
  end if;
  return null;
end $$;
revoke execute on function public.trg_driver_name_to_vehicle() from anon, authenticated, public;
drop trigger if exists drivers_name_to_vehicle on public.drivers;
create trigger drivers_name_to_vehicle after update on public.drivers
  for each row execute function public.trg_driver_name_to_vehicle();

-- ---------------------------------------------------------------------
-- 4. Upcoming and overdue dates (dashboard)
-- ---------------------------------------------------------------------
create or replace view public.v_fleet_expiries with (security_invoker = true) as
  select v.company_id, 'registration'::text as kind, v.id as vehicle_id, null::uuid as driver_id,
         v.plate_number as label, v.registration_expiry_date as due_date
    from public.vehicles v where v.registration_expiry_date is not null and v.status not in ('Sold', 'Scrapped')
  union all
  select v.company_id, 'insurance', v.id, null, v.plate_number, v.insurance_expiry_date
    from public.vehicles v where v.insurance_expiry_date is not null and v.status not in ('Sold', 'Scrapped')
  union all
  select v.company_id, 'permit', v.id, null, v.plate_number, v.permit_expiry_date
    from public.vehicles v where v.permit_expiry_date is not null and v.status not in ('Sold', 'Scrapped')
  union all
  select v.company_id, 'inspection', v.id, null, v.plate_number, v.next_inspection_date
    from public.vehicles v where v.next_inspection_date is not null and v.status not in ('Sold', 'Scrapped')
  union all
  select d.company_id, 'licence', (select id from public.vehicles where driver_id = d.id limit 1), d.id,
         d.display_name, d.licence_expiry_date
    from public.drivers d where d.status = 'Active';
grant select on public.v_fleet_expiries to authenticated;

-- ---------------------------------------------------------------------
-- 5. Expiry alerts: adds permit, inspection, driver licence and service due
-- ---------------------------------------------------------------------
-- p_days null = the organization's expiry_alert_days.
create or replace function public.refresh_expiry_notifications(p_days integer default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer := 0; v_c integer;
        v_days integer := coalesce(p_days, (select expiry_alert_days from public.organizations limit 1), 30);
begin
  -- dated items of vehicles and drivers (one view for all kinds)
  insert into public.notifications (company_id, user_id, type, title, message, severity, link, vehicle_id, reference_id, dedupe_key)
  select x.company_id, null, x.kind || '_expiring',
         initcap(k.noun) || case when x.due_date < current_date then ' ' || k.past || ': ' else ' due: ' end || x.label,
         initcap(k.noun) || ' of ' || x.label || ' '
           || case when x.due_date < current_date then k.past || ' on ' else 'is due on ' end
           || to_char(x.due_date, 'YYYY-MM-DD') || '.',
         case when x.due_date < current_date then 'critical' else 'warning' end,
         case when x.kind = 'licence' then 'drivers' else 'vehicles' end,
         x.vehicle_id, coalesce(x.driver_id, x.vehicle_id),
         -- 'reg'/'ins' keep the keys of the earlier version, so existing alerts are not repeated
         case x.kind when 'registration' then 'reg' when 'insurance' then 'ins' else x.kind end
           || ':' || coalesce(x.driver_id, x.vehicle_id) || ':' || x.due_date || ':'
           || case when x.due_date < current_date then 'expired' else 'soon' end
  from (
    select v.company_id, k2.kind, v.id as vehicle_id, null::uuid as driver_id, v.plate_number as label, k2.due_date
      from public.vehicles v
      cross join lateral (values ('registration', v.registration_expiry_date), ('insurance', v.insurance_expiry_date),
                                 ('permit', v.permit_expiry_date), ('inspection', v.next_inspection_date)) as k2(kind, due_date)
     where v.status not in ('Sold', 'Scrapped') and k2.due_date is not null
    union all
    select d.company_id, 'licence', null, d.id, d.display_name, d.licence_expiry_date
      from public.drivers d where d.status = 'Active'
  ) x
  join (values ('registration', 'registration', 'expired'), ('insurance', 'insurance', 'expired'),
               ('permit', 'route permit', 'expired'), ('inspection', 'inspection', 'overdue'),
               ('licence', 'driving licence', 'expired')) as k(kind, noun, past) on k.kind = x.kind
  where x.due_date <= current_date + v_days
  on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  -- service due: from the last maintenance record's next-service date/mileage, else the vehicle type interval
  insert into public.notifications (company_id, user_id, type, title, message, severity, link, vehicle_id, reference_id, dedupe_key)
  select s.company_id, null, 'service_due',
         'Service ' || case when s.overdue then 'overdue: ' else 'due: ' end || s.plate_number,
         'Service of ' || s.plate_number || ' is due'
           || coalesce(' on ' || to_char(s.due_date, 'YYYY-MM-DD'), '')
           || coalesce(case when s.due_date is not null then ' or' else '' end || ' at ' || s.due_km || ' km', '')
           || ' (now ' || s.current_mileage || ' km).',
         case when s.overdue then 'critical' else 'warning' end,
         'maintenance', s.vehicle_id, s.record_id,
         'service:' || s.record_id || ':' || case when s.overdue then 'overdue' else 'soon' end
  from (
    select v.company_id, v.id as vehicle_id, v.plate_number, v.current_mileage, m.id as record_id,
           coalesce(m.next_service_date, m.maintenance_date + make_interval(months => t.service_interval_months))::date as due_date,
           coalesce(m.next_service_mileage, m.odometer_reading + t.service_interval_km) as due_km,
           (coalesce(m.next_service_date, m.maintenance_date + make_interval(months => t.service_interval_months))::date < current_date
             or v.current_mileage >= coalesce(m.next_service_mileage, m.odometer_reading + t.service_interval_km)) as overdue
      from public.vehicles v
      left join public.vehicle_types t on t.id = v.vehicle_type_id
      join lateral (select * from public.maintenance_records r where r.vehicle_id = v.id
                     order by r.maintenance_date desc, r.created_at desc limit 1) m on true
     where v.status not in ('Sold', 'Scrapped')
  ) s
  where (s.due_date is not null and s.due_date <= current_date + v_days)
     or (s.due_km is not null and s.current_mileage >= s.due_km - 500)
  on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  -- documents
  insert into public.notifications (company_id, user_id, type, title, message, severity, link, vehicle_id, reference_id, dedupe_key)
  select d.company_id, null, 'document_expiry',
         case when d.expiry_date < current_date then 'Document expired: ' else 'Document expiring: ' end || d.document_name,
         d.category || ' document "' || d.document_name || '" '
           || case when d.expiry_date < current_date
                   then 'expired on ' || to_char(d.expiry_date, 'YYYY-MM-DD')
                   else 'expires on ' || to_char(d.expiry_date, 'YYYY-MM-DD') end || '.',
         case when d.expiry_date < current_date then 'critical' else 'warning' end,
         'documents', d.vehicle_id, d.id,
         'doc:' || d.id || ':' || d.expiry_date || ':'
           || case when d.expiry_date < current_date then 'expired' else 'soon' end
  from public.documents d
  where d.expiry_date is not null and d.expiry_date <= current_date + v_days
  on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  -- overdue invoices (one alert per invoice)
  insert into public.notifications (company_id, user_id, type, title, message, severity, link, vehicle_id, reference_id, dedupe_key)
  select i.company_id, null, 'invoice_overdue',
         'Invoice overdue: ' || i.invoice_number,
         i.invoice_type || ' invoice ' || i.invoice_number || ' is overdue since ' || to_char(i.due_date, 'YYYY-MM-DD')
           || ' (outstanding ' || to_char(i.outstanding_amount, 'FM999G999G990D000') || ').',
         'critical', 'invoices', null, i.id,
         'inv-overdue:' || i.id
  from public.invoices i
  where not i.is_credit_note and i.outstanding_amount > 0 and i.payment_status <> 'Cancelled'
    and i.due_date < current_date
  on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  return v_n;
end $$;
revoke all on function public.refresh_expiry_notifications(integer) from public, anon, authenticated;

create or replace function public.run_expiry_notifications()
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_super_admin() or public.has_perm('settings', 'edit')) then
    raise exception 'Permission denied';
  end if;
  return public.refresh_expiry_notifications(null);
end $$;
revoke all on function public.run_expiry_notifications() from public, anon;
grant execute on function public.run_expiry_notifications() to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('refresh-expiry-notifications', '0 3 * * *', 'select public.refresh_expiry_notifications(null)');
  end if;
end $$;
