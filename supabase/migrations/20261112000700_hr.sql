-- Phase 6: HR.
--   1. Departments and designations (organization masters); employees reference them.
--   2. Employee profile: manager, sponsor, ID / passport / visa / labour card numbers and expiries,
--      termination date. Employees use the "hr" module (payroll users can still read them).
--   3. Attendance: one row per employee per day (manual entry or CSV import), overtime hours.
--   4. Leave: types, adjustments (opening / carry-forward), requests with balance and overlap checks,
--      approval by review_leave(); approved leave marks attendance "On Leave".
--   5. Payroll workflow: payroll_generate (Draft) -> payroll_update_item -> payroll_submit ->
--      payroll_approve (posts the accrual journal) -> payroll_pay (pays net from a bank account).
--      Recurring allowances / deductions, overtime from attendance, unpaid leave, proration for
--      joiners and leavers, end-of-service gratuity for leavers, payslip lines.
--   6. HR documents (documents.employee_id) and expiry alerts for employee papers.

-- ---------------------------------------------------------------------
-- 0. Organization HR settings
-- ---------------------------------------------------------------------
alter table public.organizations add column if not exists payroll_hours_per_day numeric(4,2) not null default 8
  check (payroll_hours_per_day > 0 and payroll_hours_per_day <= 24);
alter table public.organizations add column if not exists payroll_overtime_rate numeric(4,2) not null default 1.25
  check (payroll_overtime_rate >= 1 and payroll_overtime_rate <= 5);
alter table public.organizations add column if not exists gratuity_initial_years numeric(4,1) not null default 3
  check (gratuity_initial_years >= 0 and gratuity_initial_years <= 50);
alter table public.organizations add column if not exists gratuity_days_initial numeric(5,2) not null default 15
  check (gratuity_days_initial >= 0 and gratuity_days_initial <= 60);
alter table public.organizations add column if not exists gratuity_days_later numeric(5,2) not null default 30
  check (gratuity_days_later >= 0 and gratuity_days_later <= 60);

-- ---------------------------------------------------------------------
-- 1. Departments and designations
-- ---------------------------------------------------------------------
create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> ''),
  code        text,
  active      boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now()
);
create unique index if not exists departments_name on public.departments (lower(btrim(name)));

create table if not exists public.designations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (btrim(name) <> ''),
  department_id uuid references public.departments(id) on delete set null,
  active        boolean not null default true,
  sort_order    integer not null default 100,
  created_at    timestamptz not null default now()
);
create unique index if not exists designations_name on public.designations (lower(btrim(name)));

insert into public.departments (name, sort_order)
select d, 100 from (select distinct btrim(department) d from public.employees where btrim(coalesce(department, '')) <> '') x
on conflict do nothing;
insert into public.departments (name, sort_order)
select v, o from (values ('Operations', 10), ('Maintenance', 20), ('Finance', 30), ('Administration', 40), ('HR', 50), ('Sales', 60)) as s(v, o)
on conflict do nothing;
insert into public.designations (name)
select d from (select distinct btrim(designation) d from public.employees where btrim(coalesce(designation, '')) <> '') x
on conflict do nothing;
insert into public.designations (name, sort_order)
select v, o from (values ('Driver', 10), ('Bus Driver', 11), ('Mechanic', 20), ('Supervisor', 30), ('Accountant', 40), ('Manager', 50)) as s(v, o)
on conflict do nothing;

do $$
declare t text;
begin
  foreach t in array array['departments', 'designations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.has_perm(''hr'', ''edit''))) with check ((select public.has_perm(''hr'', ''edit'')))', t || '_write', t);
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.trg_audit()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Employee profile
-- ---------------------------------------------------------------------
alter table public.employees add column if not exists department_id           uuid references public.departments(id) on delete restrict;
alter table public.employees add column if not exists designation_id          uuid references public.designations(id) on delete restrict;
alter table public.employees add column if not exists manager_id              uuid references public.employees(id) on delete set null;
alter table public.employees add column if not exists sponsor                 text;
alter table public.employees add column if not exists date_of_birth           date;
alter table public.employees add column if not exists civil_id_expiry_date    date;
alter table public.employees add column if not exists passport_expiry_date    date;
alter table public.employees add column if not exists visa_number             text;
alter table public.employees add column if not exists visa_expiry_date        date;
alter table public.employees add column if not exists labour_card_number      text;
alter table public.employees add column if not exists labour_card_expiry_date date;
alter table public.employees add column if not exists termination_date        date;
alter table public.employees add column if not exists gratuity_paid_on        date;
do $$ begin
  alter table public.employees add constraint employees_termination_after_joining
    check (termination_date is null or termination_date >= joining_date);
exception when duplicate_object then null; end $$;

update public.employees e set department_id = d.id from public.departments d
 where e.department_id is null and lower(btrim(e.department)) = lower(btrim(d.name));
update public.employees e set designation_id = d.id from public.designations d
 where e.designation_id is null and lower(btrim(e.designation)) = lower(btrim(d.name));

-- Text and id stay in step (forms may send either). Unknown or inactive names are rejected.
create or replace function public.trg_employee_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text; v_active boolean; v_mgr uuid; v_depth int := 0;
begin
  -- department
  if tg_op = 'INSERT' or new.department_id is distinct from old.department_id or new.department is distinct from old.department then
    if new.department_id is not null and (tg_op = 'INSERT' or new.department_id is distinct from old.department_id) then
      select name, active into v_name, v_active from public.departments where id = new.department_id;
      if not found then raise exception 'Unknown department'; end if;
    else
      select id, name, active into v_id, v_name, v_active from public.departments where lower(btrim(name)) = lower(btrim(new.department));
      if not found then
        -- server-side imports create the master row; app users pick from the list
        if auth.uid() is not null or coalesce(btrim(new.department), '') = '' then
          raise exception 'Unknown department "%" (add it under HR → Departments)', new.department;
        end if;
        insert into public.departments (name) values (btrim(new.department)) returning id, name, active into v_id, v_name, v_active;
      end if;
      new.department_id := v_id;
    end if;
    if not v_active and (tg_op = 'INSERT' or new.department_id is distinct from old.department_id) then
      raise exception 'Department % is inactive', v_name;
    end if;
    new.department := v_name;
  end if;
  -- designation
  if tg_op = 'INSERT' or new.designation_id is distinct from old.designation_id or new.designation is distinct from old.designation then
    if new.designation_id is not null and (tg_op = 'INSERT' or new.designation_id is distinct from old.designation_id) then
      select name, active into v_name, v_active from public.designations where id = new.designation_id;
      if not found then raise exception 'Unknown designation'; end if;
    else
      select id, name, active into v_id, v_name, v_active from public.designations where lower(btrim(name)) = lower(btrim(new.designation));
      if not found then
        -- server-side imports create the master row; app users pick from the list
        if auth.uid() is not null or coalesce(btrim(new.designation), '') = '' then
          raise exception 'Unknown designation "%" (add it under HR → Designations)', new.designation;
        end if;
        insert into public.designations (name) values (btrim(new.designation)) returning id, name, active into v_id, v_name, v_active;
      end if;
      new.designation_id := v_id;
    end if;
    if not v_active and (tg_op = 'INSERT' or new.designation_id is distinct from old.designation_id) then
      raise exception 'Designation % is inactive', v_name;
    end if;
    new.designation := v_name;
  end if;
  -- manager: not self, no loop
  if new.manager_id is not null and (tg_op = 'INSERT' or new.manager_id is distinct from old.manager_id) then
    if new.manager_id = new.id then raise exception 'An employee cannot be their own manager'; end if;
    v_mgr := new.manager_id;
    while v_mgr is not null and v_depth < 50 loop
      select manager_id into v_mgr from public.employees where id = v_mgr;
      if v_mgr = new.id then raise exception 'This manager reports to the employee (circular reporting line)'; end if;
      v_depth := v_depth + 1;
    end loop;
  end if;
  -- leaving: a termination date marks the employee Terminated
  if new.termination_date is not null and new.status <> 'Terminated' and new.termination_date <= current_date then
    new.status := 'Terminated';
  end if;
  if tg_op = 'UPDATE' and new.gratuity_paid_on is distinct from old.gratuity_paid_on and auth.uid() is not null
     and coalesce(current_setting('erp.payroll', true), '') <> 'on' then
    raise exception 'The gratuity payment date is set by payroll';
  end if;
  return new;
end $$;
revoke execute on function public.trg_employee_profile() from anon, authenticated, public;
drop trigger if exists b_employee_profile on public.employees;
create trigger b_employee_profile before insert or update on public.employees
  for each row execute function public.trg_employee_profile();

-- employees: HR module (payroll users keep read access for payroll runs)
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select to authenticated using (
  company_id = any((select public.perm_company_ids('hr', 'view'))::uuid[])
  or company_id = any((select public.perm_company_ids('payroll', 'view'))::uuid[]));
drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees for insert to authenticated
  with check (company_id = any((select public.perm_company_ids('hr', 'create'))::uuid[]));
drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees for update to authenticated
  using (company_id = any((select public.perm_company_ids('hr', 'edit'))::uuid[]))
  with check (company_id = any((select public.perm_company_ids('hr', 'edit'))::uuid[]));
drop policy if exists employees_delete on public.employees;
create policy employees_delete on public.employees for delete to authenticated
  using (company_id = any((select public.perm_company_ids('hr', 'delete'))::uuid[]));

-- ---------------------------------------------------------------------
-- 3. Attendance
-- ---------------------------------------------------------------------
create table if not exists public.attendance (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete restrict,
  employee_id     uuid not null references public.employees(id) on delete cascade,
  work_date       date not null,
  status          text not null check (status in ('Present', 'Absent', 'Late', 'Half Day', 'On Leave', 'Holiday', 'Weekend')),
  check_in        time,
  check_out       time,
  overtime_hours  numeric(5,2) not null default 0 check (overtime_hours >= 0 and overtime_hours <= 16),
  leave_request_id uuid,
  notes           text,
  created_by      uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (employee_id, work_date),
  check (check_in is null or check_out is null or check_out > check_in)
);
create index if not exists attendance_company_date on public.attendance (company_id, work_date);

create or replace function public.trg_attendance_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
declare e record;
begin
  select company_id, joining_date, termination_date, name into e from public.employees where id = new.employee_id;
  if not found then raise exception 'Employee not found'; end if;
  new.company_id := e.company_id;
  if new.work_date < e.joining_date then raise exception '% joined on %', e.name, to_char(e.joining_date, 'YYYY-MM-DD'); end if;
  if e.termination_date is not null and new.work_date > e.termination_date then
    raise exception '% left on %', e.name, to_char(e.termination_date, 'YYYY-MM-DD');
  end if;
  if new.status in ('Absent', 'On Leave', 'Holiday', 'Weekend') then new.check_in := null; new.check_out := null; end if;
  if new.status not in ('On Leave', 'Holiday', 'Weekend') and new.work_date > current_date then
    raise exception 'Attendance for % cannot be recorded in advance', to_char(new.work_date, 'YYYY-MM-DD');
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and old.company_id is distinct from new.company_id then
    raise exception 'Attendance stays with the office it was recorded in';
  end if;
  -- payroll already approved for that month: attendance is closed
  if exists (select 1 from public.payroll_runs r where r.company_id = new.company_id
              and r.year = extract(year from new.work_date) and r.month = extract(month from new.work_date)
              and r.status in ('Approved', 'Paid')) and auth.uid() is not null then
    raise exception 'Payroll for % is approved; attendance for that month is closed', to_char(new.work_date, 'FMMonth YYYY');
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.trg_attendance_defaults() from anon, authenticated, public;
drop trigger if exists a_attendance_defaults on public.attendance;
create trigger a_attendance_defaults before insert or update on public.attendance
  for each row execute function public.trg_attendance_defaults();

-- ---------------------------------------------------------------------
-- 4. Leave
-- ---------------------------------------------------------------------
create table if not exists public.leave_types (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (btrim(name) <> ''),
  code              text not null check (code ~ '^[A-Z][A-Z0-9_]{0,15}$'),
  days_per_year     numeric(5,1) check (days_per_year is null or days_per_year >= 0),   -- null = no limit
  paid              boolean not null default true,
  carry_forward_max numeric(5,1) not null default 0 check (carry_forward_max >= 0),
  requires_document boolean not null default false,
  active            boolean not null default true,
  sort_order        integer not null default 100,
  created_at        timestamptz not null default now()
);
create unique index if not exists leave_types_code on public.leave_types (code);
create unique index if not exists leave_types_name on public.leave_types (lower(btrim(name)));
insert into public.leave_types (name, code, days_per_year, paid, carry_forward_max, requires_document, sort_order) values
  ('Annual leave', 'ANNUAL', 30, true, 15, false, 10),
  ('Sick leave', 'SICK', 21, true, 0, true, 20),
  ('Emergency leave', 'EMERGENCY', 6, true, 0, false, 30),
  ('Maternity leave', 'MATERNITY', 98, true, 0, true, 40),
  ('Hajj leave', 'HAJJ', 15, true, 0, false, 50),
  ('Unpaid leave', 'UNPAID', null, false, 0, false, 90)
on conflict do nothing;

create table if not exists public.leave_adjustments (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete restrict,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  year          integer not null check (year between 2000 and 2100),
  days          numeric(5,1) not null check (days <> 0),
  reason        text not null check (btrim(reason) <> ''),
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete restrict,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  start_date    date not null,
  end_date      date not null,
  days          numeric(5,1) not null default 0,      -- set by the trigger (calendar days)
  reason        text,
  document_path text,
  status        text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  requested_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  reviewed_by   uuid references public.profiles(id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,
  created_at    timestamptz not null default now(),
  check (end_date >= start_date),
  check (extract(year from start_date) = extract(year from end_date))
);
create index if not exists leave_requests_employee on public.leave_requests (employee_id, start_date);
do $$ begin
  alter table public.attendance add constraint attendance_leave_fk foreign key (leave_request_id) references public.leave_requests(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Entitlement for a year: days_per_year (pro rata in the joining / leaving year) + adjustments.
create or replace function public.leave_balance(p_employee uuid, p_type uuid, p_year integer)
returns table (entitlement numeric, adjustments numeric, taken numeric, pending numeric, remaining numeric)
language plpgsql stable security definer set search_path = public as $$
declare e record; t record; v_from date; v_to date; v_days int;
begin
  select * into e from public.employees where id = p_employee;
  if not found then return; end if;
  if auth.uid() is not null and not (public.can_in(e.company_id, 'leave', 'view') or public.can_in(e.company_id, 'hr', 'view')) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  select * into t from public.leave_types where id = p_type;
  v_from := greatest(make_date(p_year, 1, 1), e.joining_date);
  v_to := least(make_date(p_year, 12, 31), coalesce(e.termination_date, make_date(p_year, 12, 31)));
  v_days := greatest(v_to - v_from + 1, 0);
  entitlement := case when t.days_per_year is null then null
                      else round(t.days_per_year * v_days / (make_date(p_year, 12, 31) - make_date(p_year, 1, 1) + 1), 1) end;
  select coalesce(sum(days), 0) into adjustments from public.leave_adjustments where employee_id = p_employee and leave_type_id = p_type and year = p_year;
  select coalesce(sum(days) filter (where status = 'Approved'), 0), coalesce(sum(days) filter (where status = 'Pending'), 0)
    into taken, pending
    from public.leave_requests where employee_id = p_employee and leave_type_id = p_type and extract(year from start_date) = p_year;
  remaining := case when entitlement is null then null else entitlement + adjustments - taken - pending end;
  return next;
end $$;
revoke execute on function public.leave_balance(uuid, uuid, integer) from anon, public;
grant execute on function public.leave_balance(uuid, uuid, integer) to authenticated;

create or replace function public.trg_leave_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare e record; t record; b record; v_left numeric; v_bypass boolean := coalesce(current_setting('erp.leave_review', true), '') = 'on';
begin
  if tg_op = 'UPDATE' and not v_bypass then
    if new.status is distinct from old.status or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at or new.review_note is distinct from old.review_note then
      raise exception 'Use Approve / Reject / Cancel to change a leave request';
    end if;
    if old.status <> 'Pending' then raise exception 'Only pending leave requests can be changed'; end if;
    if new.employee_id <> old.employee_id then raise exception 'A leave request cannot be moved to another employee'; end if;
  end if;
  if v_bypass then return new; end if;

  select * into e from public.employees where id = new.employee_id;
  if not found then raise exception 'Employee not found'; end if;
  new.company_id := e.company_id;
  select * into t from public.leave_types where id = new.leave_type_id;
  if tg_op = 'INSERT' then
    if not t.active then raise exception 'Leave type % is inactive', t.name; end if;
    new.status := 'Pending'; new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
    new.requested_by := coalesce(auth.uid(), new.requested_by);
  end if;
  if e.status = 'Terminated' then raise exception '% has left the company', e.name; end if;
  if new.start_date < e.joining_date then raise exception 'Leave cannot start before the joining date'; end if;
  new.days := new.end_date - new.start_date + 1;
  if t.requires_document and coalesce(new.document_path, '') = '' and new.days > 2 then
    raise exception '% longer than 2 days needs a supporting document', t.name;
  end if;
  if new.document_path is not null and new.document_path !~ ('^' || e.company_id::text || '/') then
    raise exception 'The document must be uploaded for the employee''s office';
  end if;
  if exists (select 1 from public.leave_requests r where r.employee_id = new.employee_id and r.id <> new.id
              and r.status in ('Pending', 'Approved') and daterange(r.start_date, r.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')) then
    raise exception 'Overlaps another leave request of %', e.name;
  end if;
  if t.days_per_year is not null then
    select * into b from public.leave_balance(new.employee_id, new.leave_type_id, extract(year from new.start_date)::int);
    v_left := b.remaining;
    if tg_op = 'UPDATE' and old.status = 'Pending' and old.leave_type_id = new.leave_type_id then v_left := v_left + old.days; end if;
    if v_left - new.days < 0 then
      raise exception 'Not enough % balance: % day(s) left, % requested', lower(t.name), greatest(v_left, 0), new.days;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.trg_leave_request() from anon, authenticated, public;
drop trigger if exists a_leave_request on public.leave_requests;
create trigger a_leave_request before insert or update on public.leave_requests
  for each row execute function public.trg_leave_request();

create or replace function public.trg_leave_adjustment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select company_id into new.company_id from public.employees where id = new.employee_id;
  if new.company_id is null then raise exception 'Employee not found'; end if;
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end $$;
revoke execute on function public.trg_leave_adjustment() from anon, authenticated, public;
drop trigger if exists a_leave_adjustment on public.leave_adjustments;
create trigger a_leave_adjustment before insert or update on public.leave_adjustments
  for each row execute function public.trg_leave_adjustment();

-- Approve / reject (approve rights in the employee's office; not your own request) or cancel
-- (the requester, or anyone with leave edit rights; an approved leave cannot be cancelled once
-- its payroll month is approved).
create or replace function public.review_leave(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record; d date;
begin
  select * into r from public.leave_requests where id = p_id for update;
  if not found then raise exception 'Leave request not found'; end if;
  if p_decision not in ('Approved', 'Rejected', 'Cancelled') then raise exception 'Unknown decision %', p_decision; end if;
  if p_decision = 'Cancelled' then
    if r.status not in ('Pending', 'Approved') then raise exception 'Only pending or approved leave can be cancelled'; end if;
    if not (r.requested_by = auth.uid() or public.can_in(r.company_id, 'leave', 'edit')) then
      raise exception 'Permission denied' using errcode = '42501';
    end if;
    if r.status = 'Approved' and exists (select 1 from public.payroll_runs pr where pr.company_id = r.company_id
         and pr.status in ('Approved', 'Paid') and make_date(pr.year, pr.month, 1) <= r.end_date
         and (make_date(pr.year, pr.month, 1) + interval '1 month - 1 day')::date >= r.start_date) then
      raise exception 'Payroll for this leave period is approved; the leave cannot be cancelled';
    end if;
  else
    if r.status <> 'Pending' then raise exception 'Only pending leave requests can be reviewed'; end if;
    if not public.can_in(r.company_id, 'leave', 'approve') then raise exception 'Permission denied' using errcode = '42501'; end if;
    if r.requested_by = auth.uid() and not public.is_super_admin() then
      raise exception 'You cannot approve a leave request you submitted';
    end if;
    if p_decision = 'Rejected' and coalesce(btrim(p_note), '') = '' then raise exception 'A reason is required to reject'; end if;
  end if;

  perform set_config('erp.leave_review', 'on', true);
  update public.leave_requests set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_id;
  perform set_config('erp.leave_review', '', true);

  if p_decision = 'Approved' then
    for d in select generate_series(r.start_date, r.end_date, interval '1 day')::date loop
      insert into public.attendance (employee_id, company_id, work_date, status, leave_request_id, notes)
      values (r.employee_id, r.company_id, d, 'On Leave', r.id, 'Approved leave')
      on conflict (employee_id, work_date) do update set status = 'On Leave', leave_request_id = excluded.leave_request_id,
        check_in = null, check_out = null, overtime_hours = 0;
    end loop;
  elsif p_decision = 'Cancelled' and r.status = 'Approved' then
    delete from public.attendance where leave_request_id = r.id;
  end if;

  if r.requested_by is not null and r.requested_by <> auth.uid() then
    insert into public.notifications (company_id, user_id, type, title, message, severity, link, reference_id)
    select r.company_id, r.requested_by, 'leave_review', 'Leave ' || lower(p_decision) || ': ' || e.name,
           e.name || '''s leave from ' || to_char(r.start_date, 'YYYY-MM-DD') || ' to ' || to_char(r.end_date, 'YYYY-MM-DD')
             || ' was ' || lower(p_decision) || coalesce(' (' || nullif(btrim(p_note), '') || ')', '') || '.',
           case p_decision when 'Approved' then 'success' else 'warning' end, 'leave', r.id
      from public.employees e where e.id = r.employee_id;
  end if;
end $$;
revoke execute on function public.review_leave(uuid, text, text) from anon, public;
grant execute on function public.review_leave(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Payroll components and workflow
-- ---------------------------------------------------------------------
create table if not exists public.pay_components (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (btrim(name) <> ''),
  kind            text not null check (kind in ('Allowance', 'Deduction')),
  gl_account_code text check (gl_account_code is null or gl_account_code ~ '^[0-9]{3,6}$'),
  active          boolean not null default true,
  sort_order      integer not null default 100,
  created_at      timestamptz not null default now()
);
create unique index if not exists pay_components_name on public.pay_components (lower(btrim(name)));
insert into public.pay_components (name, kind, gl_account_code, sort_order) values
  ('Fuel allowance', 'Allowance', null, 10), ('Phone allowance', 'Allowance', null, 20), ('Shift allowance', 'Allowance', null, 30),
  ('Accommodation recovery', 'Deduction', '2060', 60), ('Traffic fine recovery', 'Deduction', '2060', 70)
on conflict do nothing;

create table if not exists public.employee_pay_components (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete restrict,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  component_id  uuid not null references public.pay_components(id) on delete restrict,
  amount        numeric(14,3) not null check (amount > 0),
  start_date    date not null,
  end_date      date,
  notes         text,
  created_at    timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists employee_pay_components_employee on public.employee_pay_components (employee_id);
create or replace function public.trg_employee_pay_component() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select company_id into new.company_id from public.employees where id = new.employee_id;
  if new.company_id is null then raise exception 'Employee not found'; end if;
  return new;
end $$;
revoke execute on function public.trg_employee_pay_component() from anon, authenticated, public;
drop trigger if exists a_employee_pay_component on public.employee_pay_components;
create trigger a_employee_pay_component before insert or update on public.employee_pay_components
  for each row execute function public.trg_employee_pay_component();

alter table public.payroll_items add column if not exists overtime_hours    numeric(6,2) not null default 0 check (overtime_hours >= 0);
alter table public.payroll_items add column if not exists unpaid_leave_days numeric(5,1) not null default 0 check (unpaid_leave_days >= 0);
alter table public.payroll_items add column if not exists days_worked       numeric(5,1);
alter table public.payroll_items add column if not exists gratuity_amount   numeric(14,3) not null default 0 check (gratuity_amount >= 0);
alter table public.payroll_items add column if not exists notes             text;
alter table public.payroll_runs  add column if not exists submitted_by      uuid references public.profiles(id) on delete set null;
alter table public.payroll_runs  add column if not exists payment_journal_entry_id uuid references public.journal_entries(id);

create table if not exists public.payroll_item_lines (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.payroll_items(id) on delete cascade,
  kind         text not null check (kind in ('Allowance', 'Deduction', 'Gratuity')),
  component_id uuid references public.pay_components(id) on delete set null,
  description  text not null,
  amount       numeric(14,3) not null check (amount >= 0),
  gl_account_code text
);
create index if not exists payroll_item_lines_item on public.payroll_item_lines (item_id);

do $$
declare t text;
begin
  foreach t in array array['attendance', 'leave_adjustments', 'leave_requests', 'employee_pay_components'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
  foreach t in array array['leave_types', 'pay_components'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
  end loop;
  alter table public.payroll_item_lines enable row level security;
  alter table public.payroll_item_lines force row level security;
  grant select on public.payroll_item_lines to authenticated;
end $$;
drop policy if exists leave_types_write on public.leave_types;
create policy leave_types_write on public.leave_types for all to authenticated
  using ((select public.has_perm('leave', 'edit'))) with check ((select public.has_perm('leave', 'edit')));
drop policy if exists pay_components_write on public.pay_components;
create policy pay_components_write on public.pay_components for all to authenticated
  using ((select public.has_perm('payroll', 'edit'))) with check ((select public.has_perm('payroll', 'edit')));

-- per-office policies: module per table
do $$
declare r record;
begin
  for r in select * from (values ('attendance', 'attendance'), ('leave_adjustments', 'leave'), ('leave_requests', 'leave'),
                                 ('employee_pay_components', 'payroll')) as v(tbl, module) loop
    execute format('drop policy if exists %I on public.%I', r.tbl || '_select', r.tbl);
    execute format('create policy %I on public.%I for select to authenticated using (company_id = any((select public.perm_company_ids(%L, ''view''))::uuid[]))', r.tbl || '_select', r.tbl, r.module);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_insert', r.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (company_id = any((select public.perm_company_ids(%L, ''create''))::uuid[]))', r.tbl || '_insert', r.tbl, r.module);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_update', r.tbl);
    execute format('create policy %I on public.%I for update to authenticated using (company_id = any((select public.perm_company_ids(%L, ''edit''))::uuid[])) with check (company_id = any((select public.perm_company_ids(%L, ''edit''))::uuid[]))', r.tbl || '_update', r.tbl, r.module, r.module);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_delete', r.tbl);
    execute format('create policy %I on public.%I for delete to authenticated using (company_id = any((select public.perm_company_ids(%L, ''delete''))::uuid[]))', r.tbl || '_delete', r.tbl, r.module);
    execute format('drop trigger if exists %I on public.%I', r.tbl || '_audit', r.tbl);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.trg_audit()', r.tbl || '_audit', r.tbl);
  end loop;
end $$;
-- a leave request is created by the requester with leave:create; a pending one can be withdrawn
drop policy if exists leave_requests_delete on public.leave_requests;
create policy leave_requests_delete on public.leave_requests for delete to authenticated
  using (status = 'Pending' and (requested_by = (select auth.uid()) or company_id = any((select public.perm_company_ids('leave', 'delete'))::uuid[])));
drop policy if exists payroll_item_lines_select on public.payroll_item_lines;
create policy payroll_item_lines_select on public.payroll_item_lines for select to authenticated using (exists (
  select 1 from public.payroll_items i join public.payroll_runs r on r.id = i.run_id
   where i.id = payroll_item_lines.item_id and r.company_id = any((select public.perm_company_ids('payroll', 'view'))::uuid[])));
drop trigger if exists leave_types_audit on public.leave_types;
create trigger leave_types_audit after insert or update or delete on public.leave_types for each row execute function public.trg_audit();
drop trigger if exists pay_components_audit on public.pay_components;
create trigger pay_components_audit after insert or update or delete on public.pay_components for each row execute function public.trg_audit();

-- End-of-service gratuity as of a date: (initial years x initial days + later years x later days) x basic / 30.
create or replace function public.employee_gratuity(p_employee uuid, p_as_of date default null)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare e record; o record; v_end date; v_years numeric;
begin
  select * into e from public.employees where id = p_employee;
  if not found then raise exception 'Employee not found'; end if;
  if auth.uid() is not null and not (public.can_in(e.company_id, 'payroll', 'view') or public.can_in(e.company_id, 'hr', 'view')) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  select coalesce(max(gratuity_initial_years), 3) y, coalesce(max(gratuity_days_initial), 15) d1, coalesce(max(gratuity_days_later), 30) d2
    into o from public.organizations;
  v_end := coalesce(p_as_of, e.termination_date, current_date);
  v_years := greatest(v_end - e.joining_date + 1, 0) / 365.25;
  return round((least(v_years, o.y) * o.d1 + greatest(v_years - o.y, 0) * o.d2) * e.basic_salary / 30, 3);
end $$;
revoke execute on function public.employee_gratuity(uuid, date) from anon, public;
grant execute on function public.employee_gratuity(uuid, date) to authenticated;

-- Builds (or rebuilds) the items of a Draft run. Manual bonus / loan deduction / overtime hours /
-- notes entered on an item are kept for the same employee.
create or replace function public._payroll_fill(p_run uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record; o record; e record; keep record; v_item uuid;
  v_start date; v_end date; v_dim int; v_from date; v_to date; v_factor numeric; v_basic numeric;
  v_unpaid numeric; v_ot numeric; v_allow numeric; v_ded numeric; v_grat numeric; v_n int := 0;
begin
  select * into r from public.payroll_runs where id = p_run;
  select coalesce(max(payroll_hours_per_day), 8) hpd, coalesce(max(payroll_overtime_rate), 1.25) otr into o from public.organizations;
  v_start := make_date(r.year, r.month, 1);
  v_end := (v_start + interval '1 month - 1 day')::date;
  v_dim := v_end - v_start + 1;

  create temp table if not exists _payroll_keep (employee_id uuid primary key, bonus numeric, loan numeric, ot_hours numeric, notes text) on commit drop;
  delete from _payroll_keep;
  insert into _payroll_keep
    select employee_id, bonus_amount, loan_advance_deduction, case when overtime_hours > 0 then overtime_hours end, notes
      from public.payroll_items where run_id = p_run;
  delete from public.payroll_items where run_id = p_run;

  for e in select * from public.employees
            where company_id = r.company_id and joining_date <= v_end
              and (status <> 'Terminated' or (termination_date is not null and termination_date >= v_start))
            order by employee_code loop
    v_from := greatest(v_start, e.joining_date);
    v_to := least(v_end, coalesce(e.termination_date, v_end));
    v_factor := (v_to - v_from + 1)::numeric / v_dim;
    v_basic := round(e.basic_salary * v_factor, 3);
    select * into keep from _payroll_keep where employee_id = e.id;

    -- unpaid leave days in the month
    select coalesce(sum(least(lr.end_date, v_to) - greatest(lr.start_date, v_from) + 1), 0) into v_unpaid
      from public.leave_requests lr join public.leave_types lt on lt.id = lr.leave_type_id
     where lr.employee_id = e.id and lr.status = 'Approved' and not lt.paid
       and lr.start_date <= v_to and lr.end_date >= v_from;
    select coalesce(keep.ot_hours, coalesce(sum(a.overtime_hours), 0)) into v_ot
      from public.attendance a where a.employee_id = e.id and a.work_date between v_from and v_to;

    insert into public.payroll_items (run_id, employee_id, basic_salary, housing_allowance, transport_allowance, other_allowances,
        overtime_hours, overtime_amount, bonus_amount, pasi_employee_deduction, pasi_employer_contribution,
        unpaid_leave_days, unpaid_leave_deduction, loan_advance_deduction, other_deductions, days_worked, notes, status)
    values (p_run, e.id, v_basic, round(e.housing_allowance * v_factor, 3), round(e.transport_allowance * v_factor, 3),
        round(e.other_allowances * v_factor, 3), v_ot, round(v_ot * e.basic_salary / (30 * o.hpd) * o.otr, 3), coalesce(keep.bonus, 0),
        round(v_basic * e.pasi_employee_pct / 100, 3), round(v_basic * e.pasi_employer_pct / 100, 3),
        v_unpaid, round(v_unpaid * e.basic_salary / 30, 3), coalesce(keep.loan, 0), 0, (v_to - v_from + 1), keep.notes, 'Pending')
    returning id into v_item;

    -- recurring components active in the month (pro rata like the salary)
    insert into public.payroll_item_lines (item_id, kind, component_id, description, amount, gl_account_code)
    select v_item, c.kind, c.id, c.name, round(ec.amount * v_factor, 3), c.gl_account_code
      from public.employee_pay_components ec join public.pay_components c on c.id = ec.component_id
     where ec.employee_id = e.id and ec.start_date <= v_to and (ec.end_date is null or ec.end_date >= v_from);
    -- end-of-service gratuity when the employee leaves this month
    if e.termination_date is not null and e.termination_date between v_start and v_end and e.gratuity_paid_on is null then
      v_grat := public.employee_gratuity(e.id, e.termination_date);
      if v_grat > 0 then
        insert into public.payroll_item_lines (item_id, kind, description, amount, gl_account_code)
        values (v_item, 'Gratuity', 'End-of-service gratuity', v_grat, '5080');
      end if;
    end if;
    select coalesce(sum(amount) filter (where kind in ('Allowance', 'Gratuity')), 0), coalesce(sum(amount) filter (where kind = 'Deduction'), 0),
           coalesce(sum(amount) filter (where kind = 'Gratuity'), 0)
      into v_allow, v_ded, v_grat from public.payroll_item_lines where item_id = v_item;
    update public.payroll_items set other_allowances = other_allowances + v_allow, other_deductions = v_ded, gratuity_amount = v_grat
     where id = v_item;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'No eligible employees for % in this office', to_char(v_start, 'FMMonth YYYY'); end if;
  return v_n;
end $$;
revoke execute on function public._payroll_fill(uuid) from anon, authenticated, public;

create or replace function public.payroll_generate(p_company uuid, p_year integer, p_month integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_run uuid;
begin
  if not public.can_in(p_company, 'payroll', 'create') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if p_month not between 1 and 12 or p_year not between 2000 and 2100 then raise exception 'Invalid payroll period'; end if;
  if exists (select 1 from public.payroll_runs where company_id = p_company and year = p_year and month = p_month) then
    raise exception 'A payroll for % already exists in this office', to_char(make_date(p_year, p_month, 1), 'FMMonth YYYY');
  end if;
  insert into public.payroll_runs (company_id, payroll_number, month, year, status, notes)
  values (p_company, 'PR-' || p_year || '-' || lpad(p_month::text, 2, '0'), p_month, p_year, 'Draft',
          'Payroll for ' || to_char(make_date(p_year, p_month, 1), 'FMMonth YYYY'))
  returning id into v_run;
  perform public._payroll_fill(v_run);
  return v_run;
end $$;

create or replace function public.payroll_recalculate(p_run uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.payroll_runs where id = p_run for update;
  if not found then raise exception 'Payroll run not found'; end if;
  if not public.can_in(r.company_id, 'payroll', 'edit') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if r.status not in ('Draft', 'Under Review') then raise exception 'Only draft payroll can be recalculated'; end if;
  update public.payroll_runs set status = 'Draft', submitted_by = null where id = p_run;
  return public._payroll_fill(p_run);
end $$;

create or replace function public.payroll_update_item(p_item uuid, p_bonus numeric, p_loan numeric, p_overtime_hours numeric, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
declare i record; r record; e record; o record;
begin
  select * into i from public.payroll_items where id = p_item;
  if not found then raise exception 'Payroll line not found'; end if;
  select * into r from public.payroll_runs where id = i.run_id for update;
  if not public.can_in(r.company_id, 'payroll', 'edit') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if r.status <> 'Draft' then raise exception 'Only draft payroll can be edited (recalculate to reopen a submitted run)'; end if;
  if coalesce(p_bonus, 0) < 0 or coalesce(p_loan, 0) < 0 or coalesce(p_overtime_hours, 0) < 0 then raise exception 'Amounts cannot be negative'; end if;
  select * into e from public.employees where id = i.employee_id;
  select coalesce(max(payroll_hours_per_day), 8) hpd, coalesce(max(payroll_overtime_rate), 1.25) otr into o from public.organizations;
  update public.payroll_items set bonus_amount = round(coalesce(p_bonus, 0), 3), loan_advance_deduction = round(coalesce(p_loan, 0), 3),
         overtime_hours = coalesce(p_overtime_hours, 0),
         overtime_amount = round(coalesce(p_overtime_hours, 0) * e.basic_salary / (30 * o.hpd) * o.otr, 3),
         notes = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_item;
  if (select net_pay from public.payroll_items where id = p_item) < 0 then
    raise exception 'Deductions exceed the pay of %', e.name;
  end if;
end $$;

create or replace function public.payroll_submit(p_run uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.payroll_runs where id = p_run for update;
  if not found then raise exception 'Payroll run not found'; end if;
  if not public.can_in(r.company_id, 'payroll', 'edit') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if r.status <> 'Draft' then raise exception 'Only a draft payroll can be submitted'; end if;
  if exists (select 1 from public.payroll_items where run_id = p_run and net_pay < 0) then raise exception 'A payslip has negative net pay'; end if;
  update public.payroll_runs set status = 'Under Review', submitted_by = auth.uid() where id = p_run;
end $$;

-- Approval posts the accrual:
--   Dr 5070 salaries (gross - gratuity - unpaid leave) | Dr 5080 gratuity | Dr 5075 employer PASI
--   Cr 2040 PASI (employee + employer) | Cr 1250 staff loans | Cr deduction accounts (2060) | Cr 2050 net salaries payable
create or replace function public.payroll_approve(p_run uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare r record; t record; v_je uuid; v_label text; v_lines jsonb := '[]'::jsonb; d record;
begin
  select * into r from public.payroll_runs where id = p_run for update;
  if not found then raise exception 'Payroll run not found'; end if;
  if r.status not in ('Draft', 'Under Review') then raise exception 'Only draft or submitted payroll can be approved'; end if;
  if not public.can_in(r.company_id, 'payroll', 'approve') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if r.submitted_by = auth.uid() and not public.is_super_admin() then raise exception 'You cannot approve a payroll you submitted'; end if;
  select count(*) n, coalesce(sum(gross_pay), 0) gross, coalesce(sum(gratuity_amount), 0) grat, coalesce(sum(unpaid_leave_deduction), 0) unpaid,
         coalesce(sum(pasi_employee_deduction), 0) ee, coalesce(sum(pasi_employer_contribution), 0) er,
         coalesce(sum(loan_advance_deduction), 0) loan, coalesce(sum(net_pay), 0) net, min(net_pay) min_net
    into t from public.payroll_items where run_id = p_run;
  if t.n = 0 then raise exception 'The payroll has no employees'; end if;
  if t.min_net < 0 then raise exception 'A payslip has negative net pay'; end if;
  if not public.can_approve_in(r.company_id, 'payroll', t.net) then
    raise exception 'Net pay % is above your approval limit', t.net;
  end if;
  v_label := to_char(make_date(r.year, r.month, 1), 'FMMonth YYYY');

  perform public.ensure_system_account(r.company_id, '5070', 'Driver Allowances & Logistics Staff', 'Expense', 'Operating Expense');
  perform public.ensure_system_account(r.company_id, '5075', 'PASI Employer Contribution Expense', 'Expense', 'Operating Expense');
  perform public.ensure_system_account(r.company_id, '2040', 'PASI / Social Insurance Payable', 'Liability', 'Current Liabilities');
  perform public.ensure_system_account(r.company_id, '2050', 'Salaries & Wages Payable', 'Liability', 'Current Liabilities');
  v_lines := v_lines || jsonb_build_object('account_code', '5070', 'debit', t.gross - t.grat - t.unpaid, 'description', 'Salaries ' || v_label);
  if t.grat > 0 then
    perform public.ensure_system_account(r.company_id, '5080', 'End of Service Benefits', 'Expense', 'Operating Expense');
    v_lines := v_lines || jsonb_build_object('account_code', '5080', 'debit', t.grat, 'description', 'End-of-service gratuity ' || v_label);
  end if;
  if t.er > 0 then v_lines := v_lines || jsonb_build_object('account_code', '5075', 'debit', t.er, 'description', 'Employer PASI ' || v_label); end if;
  if t.ee + t.er > 0 then v_lines := v_lines || jsonb_build_object('account_code', '2040', 'credit', t.ee + t.er, 'description', 'PASI payable ' || v_label); end if;
  if t.loan > 0 then
    perform public.ensure_system_account(r.company_id, '1250', 'Staff Loans & Advances', 'Asset', 'Current Assets');
    v_lines := v_lines || jsonb_build_object('account_code', '1250', 'credit', t.loan, 'description', 'Loan / advance recovery ' || v_label);
  end if;
  for d in select coalesce(l.gl_account_code, '2060') code, sum(l.amount) amt from public.payroll_item_lines l
            join public.payroll_items i on i.id = l.item_id where i.run_id = p_run and l.kind = 'Deduction' group by 1 loop
    if d.code = '2060' then perform public.ensure_system_account(r.company_id, '2060', 'Payroll Deductions Payable', 'Liability', 'Current Liabilities'); end if;
    if not exists (select 1 from public.accounts where company_id = r.company_id and code = d.code) then
      raise exception 'Account % (payroll deduction) is missing from this office''s chart of accounts', d.code;
    end if;
    v_lines := v_lines || jsonb_build_object('account_code', d.code, 'credit', d.amt, 'description', 'Payroll deductions ' || v_label);
  end loop;
  if t.net > 0 then v_lines := v_lines || jsonb_build_object('account_code', '2050', 'credit', t.net, 'description', 'Net salaries payable ' || v_label); end if;

  v_je := public.post_journal_entry(r.company_id, (make_date(r.year, r.month, 1) + interval '1 month - 1 day')::date,
    'Payroll ' || v_label || ' (' || t.n || ' employees)', v_lines, r.payroll_number, 'Payroll', p_run);
  update public.payroll_runs set status = 'Approved', approved_by = auth.uid(), approved_date = now(), journal_entry_id = v_je,
         notes = coalesce(nullif(btrim(coalesce(p_note, '')), ''), notes) where id = p_run;
  update public.payroll_items set status = 'Processed' where run_id = p_run;
  -- gratuity settled
  perform set_config('erp.payroll', 'on', true);
  update public.employees e set gratuity_paid_on = (make_date(r.year, r.month, 1) + interval '1 month - 1 day')::date
    from public.payroll_items i where i.run_id = p_run and i.employee_id = e.id and i.gratuity_amount > 0;
  perform set_config('erp.payroll', '', true);
  if r.submitted_by is not null and r.submitted_by <> auth.uid() then
    insert into public.notifications (company_id, user_id, type, title, message, severity, link, reference_id)
    values (r.company_id, r.submitted_by, 'payroll_approved', 'Payroll approved: ' || v_label,
            'Payroll ' || r.payroll_number || ' was approved and posted to the ledger.', 'success', 'payroll', p_run);
  end if;
  return v_je;
end $$;

-- Pays the net salaries from a bank account: Dr 2050 / Cr bank.
create or replace function public.payroll_pay(p_run uuid, p_bank_account uuid, p_payment_date date default current_date) returns uuid
language plpgsql security definer set search_path = public as $$
declare r record; ba record; v_net numeric; v_je uuid;
begin
  select * into r from public.payroll_runs where id = p_run for update;
  if not found then raise exception 'Payroll run not found'; end if;
  if r.status <> 'Approved' then raise exception 'Only approved payroll can be paid'; end if;
  if not public.can_in(r.company_id, 'payments', 'create') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if p_payment_date is null then raise exception 'Payment date is required'; end if;
  select * into ba from public.bank_accounts where id = p_bank_account and company_id = r.company_id and active;
  if not found then raise exception 'Bank account not found for this office'; end if;
  select coalesce(sum(net_pay), 0) into v_net from public.payroll_items where run_id = p_run;
  if v_net > 0 then
    v_je := public.post_journal_entry(r.company_id, p_payment_date, 'Salaries paid ' || r.payroll_number,
      jsonb_build_array(
        jsonb_build_object('account_code', '2050', 'debit', v_net, 'description', 'Net salaries ' || r.payroll_number),
        jsonb_build_object('account_code', ba.gl_account_code, 'credit', v_net, 'bank_account_id', ba.id,
                           'description', 'Salaries paid from ' || ba.bank_name)),
      r.payroll_number, 'Payroll', p_run);
  end if;
  update public.payroll_runs set status = 'Paid', payment_date = p_payment_date, bank_account_id = p_bank_account,
         payment_journal_entry_id = v_je where id = p_run;
  update public.payroll_items set status = 'Paid' where run_id = p_run;
  return v_je;
end $$;

create or replace function public.payroll_delete_draft(p_run uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.payroll_runs where id = p_run for update;
  if not found then raise exception 'Payroll run not found'; end if;
  if not public.can_in(r.company_id, 'payroll', 'delete') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if r.status not in ('Draft', 'Under Review') or r.journal_entry_id is not null then raise exception 'Only draft payroll can be deleted'; end if;
  delete from public.payroll_runs where id = p_run;
end $$;

do $$
declare f text;
begin
  foreach f in array array['payroll_generate(uuid, integer, integer)', 'payroll_recalculate(uuid)',
                           'payroll_update_item(uuid, numeric, numeric, numeric, text)', 'payroll_submit(uuid)',
                           'payroll_approve(uuid, text)', 'payroll_pay(uuid, uuid, date)', 'payroll_delete_draft(uuid)'] loop
    execute format('revoke execute on function public.%s from anon, public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- The one-step legacy process_payroll() skipped review; it now also needs payroll approve rights
-- and the approval limit (kept for API compatibility; the app uses the workflow above).
do $$
declare def text; nd text;
begin
  def := pg_get_functiondef('public.process_payroll(uuid, integer, integer, date, uuid, boolean)'::regprocedure);
  nd := regexp_replace(def, '(if p_month not between 1 and 12)',
    'if not public.can_in(p_company, ''payroll'', ''approve'') then raise exception ''Permission denied: payroll approval rights are required''; end if;' || E'\n  ' || '\1');
  if nd <> def then execute nd; end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. HR documents and employee expiry alerts
-- ---------------------------------------------------------------------
alter table public.documents add column if not exists employee_id uuid references public.employees(id) on delete set null;
create index if not exists documents_employee on public.documents (employee_id) where employee_id is not null;
create or replace function public.trg_document_employee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.employee_id is not null and not exists (select 1 from public.employees where id = new.employee_id and company_id = new.company_id) then
    raise exception 'The employee belongs to another office';
  end if;
  return new;
end $$;
revoke execute on function public.trg_document_employee() from anon, authenticated, public;
drop trigger if exists documents_employee_check on public.documents;
create trigger documents_employee_check before insert or update of employee_id, company_id on public.documents
  for each row execute function public.trg_document_employee();

-- Adds civil ID, passport, visa and labour card expiries to the daily alert run (rest unchanged).
do $$
declare def text; nd text;
begin
  def := pg_get_functiondef('public.refresh_expiry_notifications(integer)'::regprocedure);
  nd := replace(def, '  -- documents
  insert into public.notifications', '  -- employee papers (link to the HR employee list)
  insert into public.notifications (company_id, user_id, type, title, message, severity, link, vehicle_id, reference_id, dedupe_key)
  select e.company_id, null, ''employee_document_expiring'',
         k.noun || case when k.due < current_date then '' expired: '' else '' expiring: '' end || e.name,
         k.noun || '' of '' || e.name || case when k.due < current_date then '' expired on '' else '' expires on '' end
           || to_char(k.due, ''YYYY-MM-DD'') || ''.'',
         case when k.due < current_date then ''critical'' else ''warning'' end, ''employees'', null, e.id,
         ''emp-'' || k.key || '':'' || e.id || '':'' || k.due || '':'' || case when k.due < current_date then ''expired'' else ''soon'' end
  from public.employees e
  cross join lateral (values (''civil'', ''Civil ID'', e.civil_id_expiry_date), (''passport'', ''Passport'', e.passport_expiry_date),
                             (''visa'', ''Visa'', e.visa_expiry_date), (''labour'', ''Labour card'', e.labour_card_expiry_date)) as k(key, noun, due)
  where e.status <> ''Terminated'' and k.due is not null and k.due <= current_date + v_days
  on conflict (company_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_c = row_count; v_n := v_n + v_c;

  -- documents
  insert into public.notifications');
  if nd = def then raise exception 'refresh_expiry_notifications: anchor not found'; end if;
  execute nd;
end $$;
revoke all on function public.refresh_expiry_notifications(integer) from public, anon, authenticated;

-- Leave certificates live under <office>/leave/... and follow the leave module's rights
create or replace function public.storage_module(p_name text) returns text
language sql immutable as $$
  select case public.storage_entity(p_name)
    when 'documents' then 'documents' when 'expenses' then 'expenses' when 'invoices' then 'invoices'
    when 'payments' then 'payments' when 'maintenance' then 'maintenance' when 'accidents' then 'accidents'
    when 'journal' then 'accounting' when 'leave' then 'leave' end
$$;
