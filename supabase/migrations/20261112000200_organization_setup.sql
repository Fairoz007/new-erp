-- =====================================================================
-- Phase 1 (Setup Wizard) foundation: organization profile, universal settings, office
-- extensions, vehicle types, expense categories, custom-field engine, invitations, setup
-- progress and opening balances. Additive; existing rows are linked, never changed otherwise.
--
-- Design decisions (also in AUDIT_REPORT.md, section I):
--  * One organization per database (the tenant). `companies` stays the office table so every
--    existing foreign key keeps working; companies.organization_id links offices to it.
--  * Universal settings (tax rates, payment terms, units, fee schedules / price lists, document
--    number formats, financial year, letterhead) live at organization level. An office may
--    override a setting only if its key is listed in organizations.overridable_settings.
--  * Custom field VALUES are stored in a `custom_fields jsonb` column on each entity table rather
--    than an EAV field_values table: the values inherit the row's RLS automatically, load in the
--    same query, export as-is, and are indexed with GIN for search. Definitions live in
--    field_definitions; validation (required, type, options) runs in a BEFORE trigger, so the
--    server enforces required fields.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Organization
-- ---------------------------------------------------------------------
create table if not exists public.organizations (
  id                    uuid primary key default gen_random_uuid(),
  legal_name            text not null check (btrim(legal_name) <> ''),
  trade_name            text,
  cr_number             text,
  vat_number            text,
  tax_number            text,
  address               text,
  city                  text,
  country               text,
  phone                 text,
  email                 text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  website               text,
  logo_path             text,
  base_currency         text not null default 'OMR' check (base_currency ~ '^[A-Z]{3}$'),
  currency_decimals     integer not null default 3 check (currency_decimals between 0 and 3),
  fy_start_month        integer not null default 1 check (fy_start_month between 1 and 12),
  timezone              text not null default 'Asia/Muscat',
  language              text not null default 'en' check (language in ('en', 'ar')),
  letterhead            jsonb not null default '{}'::jsonb,       -- {header, footer, show_logo}
  overridable_settings  text[] not null default '{}'::text[],     -- keys an office may override
  setup_status          text not null default 'in_progress' check (setup_status in ('in_progress', 'completed')),
  setup_step            integer not null default 1 check (setup_step between 1 and 9),
  setup_completed_steps integer[] not null default '{}'::integer[],
  setup_completed_at    timestamptz,
  setup_completed_by    uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists organizations_single on public.organizations ((true));

alter table public.companies add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.companies add column if not exists manager_user_id uuid references public.profiles(id) on delete set null;
alter table public.companies add column if not exists contacts jsonb not null default '[]'::jsonb;
alter table public.companies add column if not exists settings_overrides jsonb not null default '{}'::jsonb;
alter table public.companies add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.companies drop constraint if exists companies_currency_check;
alter table public.companies add constraint companies_currency_check check (currency ~ '^[A-Z]{3}$');
alter table public.bank_accounts add column if not exists opening_date date;
alter table public.bank_accounts add column if not exists swift_code text;
alter table public.bank_accounts add column if not exists branch text;

create or replace function public.org_id() returns uuid
language sql stable security definer set search_path = public as $$ select id from public.organizations limit 1 $$;
grant execute on function public.org_id() to authenticated;

-- New offices belong to the organization and inherit its currency unless overriding is allowed
create or replace function public.trg_company_org_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
declare o public.organizations; v_bad text;
begin
  select * into o from public.organizations limit 1;
  if found then
    new.organization_id := coalesce(new.organization_id, o.id);
    if tg_op = 'INSERT' and not ('currency' = any(o.overridable_settings)) then new.currency := o.base_currency; end if;
    if tg_op = 'UPDATE' and new.currency is distinct from old.currency and not ('currency' = any(o.overridable_settings))
       and auth.uid() is not null then
      raise exception 'Office currency follows the organization base currency (overriding is not allowed)';
    end if;
    select string_agg(k, ', ') into v_bad from jsonb_object_keys(coalesce(new.settings_overrides, '{}')) k
    where not (k = any(o.overridable_settings));
    if v_bad is not null and auth.uid() is not null then
      raise exception 'These settings cannot be overridden per office: %', v_bad;
    end if;
  end if;
  if jsonb_typeof(coalesce(new.contacts, '[]')) <> 'array' then raise exception 'Office contacts must be a list'; end if;
  return new;
end $$;
revoke execute on function public.trg_company_org_defaults() from anon, authenticated, public;
drop trigger if exists companies_org_defaults on public.companies;
create trigger companies_org_defaults before insert or update on public.companies
  for each row execute function public.trg_company_org_defaults();

create or replace function public.trg_org_link_offices() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.companies set organization_id = new.id where organization_id is null;
  new.updated_at := now();
  return null;
end $$;
revoke execute on function public.trg_org_link_offices() from anon, authenticated, public;
drop trigger if exists organizations_link_offices on public.organizations;
create trigger organizations_link_offices after insert on public.organizations
  for each row execute function public.trg_org_link_offices();

-- Existing installs: create the organization from the first office so current users keep working.
-- setup_status stays 'in_progress' so the Super Admin is taken through the wizard (prefilled) on next sign-in.
insert into public.organizations (legal_name, vat_number, tax_number, address, city, country, phone, email, website, base_currency)
select c.name, c.vat_number, c.tax_number, c.address, c.city, c.country, c.phone,
       case when c.email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then c.email end, c.website,
       case when c.currency ~ '^[A-Z]{3}$' then c.currency else 'OMR' end
from public.companies c
where not exists (select 1 from public.organizations)
order by c.created_at, c.name
limit 1;

create or replace function public.trg_org_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null and not public.is_super_admin() then
    if new.setup_status is distinct from old.setup_status or new.setup_step is distinct from old.setup_step
       or new.setup_completed_steps is distinct from old.setup_completed_steps
       or new.setup_completed_at is distinct from old.setup_completed_at then
      raise exception 'Only a Super Admin can run the Setup Wizard';
    end if;
    if new.overridable_settings is distinct from old.overridable_settings or new.base_currency is distinct from old.base_currency then
      raise exception 'Only a Super Admin can change the base currency or office override rules';
    end if;
  end if;
  if new.setup_status = 'completed' and old.setup_status = 'completed' and new.base_currency is distinct from old.base_currency
     and exists (select 1 from public.journal_entries) then
    raise exception 'The base currency cannot change after transactions have been posted';
  end if;
  return new;
end $$;
revoke execute on function public.trg_org_guard() from anon, authenticated, public;
drop trigger if exists organizations_guard on public.organizations;
create trigger organizations_guard before update on public.organizations
  for each row execute function public.trg_org_guard();

-- Effective value of an overridable setting for one office
create or replace function public.office_setting(p_company uuid, p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when p_key = any(o.overridable_settings) and c.settings_overrides ? p_key
              then c.settings_overrides -> p_key end
  from public.companies c cross join public.organizations o where c.id = p_company
$$;
grant execute on function public.office_setting(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Universal settings (organization-level master data)
-- ---------------------------------------------------------------------
create table if not exists public.tax_rates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> ''),
  rate        numeric(6,3) not null check (rate between 0 and 100),
  applies_to  text not null default 'both' check (applies_to in ('sales', 'purchase', 'both')),
  is_default  boolean not null default false,
  active      boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now()
);
create unique index if not exists tax_rates_name on public.tax_rates (lower(btrim(name)));
create unique index if not exists tax_rates_one_default on public.tax_rates ((true)) where is_default;

create table if not exists public.payment_terms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> ''),
  days        integer not null check (days between 0 and 365),
  is_default  boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists payment_terms_name on public.payment_terms (lower(btrim(name)));
create unique index if not exists payment_terms_one_default on public.payment_terms ((true)) where is_default;

create table if not exists public.units (
  code        text primary key check (code ~ '^[A-Za-z0-9._-]{1,16}$'),
  name        text not null check (btrim(name) <> ''),
  active      boolean not null default true,
  sort_order  integer not null default 100
);

create table if not exists public.document_formats (
  doc_type            text primary key,
  label               text not null,
  prefix              text not null check (prefix ~ '^[A-Z0-9]{1,8}$'),
  include_year        boolean not null default true,
  include_office_code boolean not null default false,
  padding             integer not null default 4 check (padding between 1 and 9),
  scope               text not null default 'office' check (scope in ('office', 'organization')),
  sort_order          integer not null default 100
);

create table if not exists public.fee_schedules (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> ''),
  description text,
  currency    text not null default 'OMR' check (currency ~ '^[A-Z]{3}$'),
  valid_from  date,
  valid_to    date,
  is_default  boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
create unique index if not exists fee_schedules_name on public.fee_schedules (lower(btrim(name)));
create unique index if not exists fee_schedules_one_default on public.fee_schedules ((true)) where is_default;

create table if not exists public.vehicle_types (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null check (btrim(name) <> ''),
  category                text not null default 'Passenger' check (category in ('Passenger', 'Light', 'Heavy', 'Other')),
  is_bus                  boolean not null default false,
  seat_capacity           integer check (seat_capacity is null or seat_capacity between 0 and 200),
  licence_class           text,
  service_interval_km     integer check (service_interval_km is null or service_interval_km > 0),
  service_interval_months integer check (service_interval_months is null or service_interval_months between 1 and 60),
  is_system               boolean not null default false,
  active                  boolean not null default true,
  sort_order              integer not null default 100,
  created_at              timestamptz not null default now()
);
create unique index if not exists vehicle_types_name on public.vehicle_types (lower(btrim(name)));

create table if not exists public.fee_items (
  id              uuid primary key default gen_random_uuid(),
  schedule_id     uuid not null references public.fee_schedules(id) on delete cascade,
  code            text not null check (btrim(code) <> ''),
  name            text not null check (btrim(name) <> ''),
  unit_code       text references public.units(code) on update cascade,
  rate            numeric(14,3) not null check (rate >= 0),
  tax_rate_id     uuid references public.tax_rates(id) on delete set null,
  vehicle_type_id uuid references public.vehicle_types(id) on delete set null,
  gl_account_code text,
  description     text,
  sort_order      integer not null default 100,
  unique (schedule_id, code)
);

create table if not exists public.expense_categories (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (btrim(name) <> ''),
  gl_account_code  text not null check (btrim(gl_account_code) <> ''),
  requires_vehicle boolean not null default false,
  is_system        boolean not null default false,
  active           boolean not null default true,
  sort_order       integer not null default 100,
  created_at       timestamptz not null default now()
);
create unique index if not exists expense_categories_name on public.expense_categories (lower(btrim(name)));

-- Monthly recurring expense templates (drafts are generated by generate_recurring_expenses, Phase 8)
create table if not exists public.recurring_expenses (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  category_id     uuid not null references public.expense_categories(id) on delete restrict,
  description     text not null check (btrim(description) <> ''),
  amount          numeric(14,3) not null check (amount > 0),
  tax             numeric(14,3) not null default 0 check (tax >= 0),
  supplier_id     uuid references public.suppliers(id) on delete restrict,
  vehicle_id      uuid references public.vehicles(id) on delete set null,
  payment_method  text not null default 'Bank Transfer',
  day_of_month    integer not null check (day_of_month between 1 and 28),
  start_date      date not null,
  end_date        date,
  active          boolean not null default true,
  last_generated_period date,
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists recurring_expenses_company on public.recurring_expenses (company_id);

alter table public.expenses add column if not exists category_id uuid references public.expense_categories(id) on delete restrict;

-- Vehicles reference their type; the text column stays for older readers and is kept in sync
alter table public.vehicles add column if not exists vehicle_type_id uuid references public.vehicle_types(id) on delete restrict;

-- ---------------------------------------------------------------------
-- 3. Defaults (a fresh install has these and nothing else)
-- ---------------------------------------------------------------------
insert into public.vehicle_types (name, category, is_bus, seat_capacity, licence_class, service_interval_km, service_interval_months, is_system, sort_order) values
  ('Bus', 'Passenger', true, 50, 'Heavy Bus', 10000, 6, true, 10),
  ('Mini-bus', 'Passenger', true, 26, 'Light Bus', 10000, 6, true, 20),
  ('Coaster', 'Passenger', true, 30, 'Light Bus', 10000, 6, true, 30),
  ('Car', 'Light', false, 5, 'Light Vehicle', 10000, 12, true, 40),
  ('Pickup', 'Light', false, 5, 'Light Vehicle', 10000, 12, true, 50),
  ('Truck', 'Heavy', false, 3, 'Heavy Vehicle', 15000, 6, true, 60),
  ('SUV', 'Light', false, 7, 'Light Vehicle', 10000, 12, true, 70),
  ('Van', 'Light', false, 12, 'Light Vehicle', 10000, 12, true, 80)
on conflict do nothing;

-- Existing vehicles: link by type name, creating (non-system) types for names not in the defaults
insert into public.vehicle_types (name, category, is_system, sort_order)
select distinct btrim(v.vehicle_type), 'Other', false, 200 from public.vehicles v
where btrim(coalesce(v.vehicle_type, '')) <> ''
  and not exists (select 1 from public.vehicle_types t where lower(t.name) = lower(btrim(v.vehicle_type)))
on conflict do nothing;
update public.vehicles v set vehicle_type_id = t.id from public.vehicle_types t
where v.vehicle_type_id is null and lower(t.name) = lower(btrim(v.vehicle_type));

insert into public.expense_categories (name, gl_account_code, requires_vehicle, is_system, sort_order) values
  ('Fuel', '5010', false, true, 10), ('Salaries', '5070', false, true, 20), ('Rent', '5100', false, true, 30),
  ('Utilities', '5110', false, true, 40), ('Insurance', '5030', false, true, 50), ('Permits & Licences', '5120', false, true, 60),
  ('Maintenance', '5000', false, true, 70), ('Tolls & Parking', '5060', false, true, 80), ('Tyres', '5020', false, true, 90),
  ('Registration', '5040', false, true, 100), ('Office & Admin', '5130', false, true, 110)
on conflict do nothing;
-- Existing expenses: link to a category with the same name where one exists
update public.expenses e set category_id = c.id from public.expense_categories c
where e.category_id is null and lower(c.name) = lower(btrim(e.category));

insert into public.units (code, name, sort_order) values
  ('EA', 'Each', 10), ('HR', 'Hour', 20), ('DAY', 'Day', 30), ('MONTH', 'Month', 40), ('TRIP', 'Trip', 50),
  ('KM', 'Kilometre', 60), ('SEAT', 'Seat', 70), ('L', 'Litre', 80)
on conflict do nothing;

insert into public.document_formats (doc_type, label, prefix, include_year, padding, scope, sort_order) values
  ('sales_invoice', 'Sales invoice', 'INV', true, 4, 'office', 10),
  ('purchase_invoice', 'Purchase bill', 'PINV', true, 4, 'office', 20),
  ('credit_note', 'Credit note', 'CN', true, 4, 'office', 30),
  ('payment', 'Payment / receipt', 'PAY', true, 4, 'office', 40),
  ('purchase_order', 'Purchase order', 'PO', true, 4, 'office', 50),
  ('work_order', 'Work order', 'WO', true, 3, 'office', 60),
  ('expense', 'Expense', 'EXP', true, 4, 'office', 70),
  ('employee', 'Employee code', 'EMP', false, 3, 'office', 80),
  ('vehicle', 'Vehicle code', 'VH', false, 3, 'office', 90),
  ('journal', 'Journal entry', 'JE', true, 4, 'office', 100),
  ('maintenance', 'Maintenance record', 'MNT', true, 3, 'office', 110),
  ('accident', 'Accident report', 'ACC', true, 3, 'office', 120),
  ('reconciliation', 'Reconciliation', 'REC', true, 3, 'office', 130),
  ('fixed_asset', 'Fixed asset', 'FA', false, 3, 'office', 140),
  ('depreciation', 'Depreciation run', 'DEP', true, 2, 'office', 150),
  ('supplier', 'Supplier code', 'SUP', false, 3, 'organization', 160),
  ('customer', 'Customer code', 'CUST', false, 3, 'organization', 170),
  ('contract', 'Client contract', 'CON', true, 3, 'office', 180)
on conflict (doc_type) do nothing;

-- ---------------------------------------------------------------------
-- 4. Document numbering follows document_formats
-- ---------------------------------------------------------------------
create or replace function public.doc_prefix(p_type text, p_company uuid, p_date date default null) returns text
language sql stable security definer set search_path = public as $$
  select f.prefix
         || case when f.include_office_code and p_company is not null
                 then '-' || coalesce((select upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')) from public.companies where id = p_company), '') else '' end
         || case when f.include_year then '-' || public._doc_year(coalesce(p_date, current_date)) else '' end
  from public.document_formats f where f.doc_type = p_type
$$;
create or replace function public.doc_pad(p_type text) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select padding from public.document_formats where doc_type = p_type), 4)
$$;
revoke execute on function public.doc_prefix(text, uuid, date), public.doc_pad(text) from anon, public;
grant execute on function public.doc_prefix(text, uuid, date), public.doc_pad(text) to authenticated;

-- Preview the next number without consuming it
create or replace function public.preview_doc_number(p_type text, p_company uuid default null) returns text
language sql stable security definer set search_path = public as $$
  select public._fmt_doc_number(public.doc_prefix(p_type, p_company, current_date),
           coalesce((select last_value from public.doc_sequences
                     where company_id = p_company and prefix = public.doc_prefix(p_type, p_company, current_date)), 0) + 1,
           public.doc_pad(p_type))
$$;
grant execute on function public.preview_doc_number(text, uuid) to authenticated;

create or replace function public.trg_assign_doc_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  case tg_table_name
    when 'vehicles' then
      new.vehicle_code := public._assign_doc_number(new.company_id, public.doc_prefix('vehicle', new.company_id), public.doc_pad('vehicle'), new.vehicle_code);
    when 'work_orders' then
      new.work_order_number := public._assign_doc_number(new.company_id, public.doc_prefix('work_order', new.company_id, new.reported_date), public.doc_pad('work_order'), new.work_order_number);
    when 'maintenance_records' then
      new.record_number := public._assign_doc_number(new.company_id, public.doc_prefix('maintenance', new.company_id, new.maintenance_date), public.doc_pad('maintenance'), new.record_number);
    when 'accidents' then
      new.accident_number := public._assign_doc_number(new.company_id, public.doc_prefix('accident', new.company_id, new.accident_date), public.doc_pad('accident'), new.accident_number);
    when 'expenses' then
      new.expense_number := public._assign_doc_number(new.company_id, public.doc_prefix('expense', new.company_id, new.date), public.doc_pad('expense'), new.expense_number);
    when 'invoices' then
      new.invoice_number := public._assign_doc_number(new.company_id,
        public.doc_prefix(case when coalesce(new.is_credit_note, false) then 'credit_note'
                               when new.invoice_type = 'Sales' then 'sales_invoice' else 'purchase_invoice' end, new.company_id, new.invoice_date),
        public.doc_pad(case when coalesce(new.is_credit_note, false) then 'credit_note'
                            when new.invoice_type = 'Sales' then 'sales_invoice' else 'purchase_invoice' end),
        new.invoice_number);
    when 'reconciliations' then
      new.reconciliation_number := public._assign_doc_number(new.company_id, public.doc_prefix('reconciliation', new.company_id, new.reconciled_date), public.doc_pad('reconciliation'), new.reconciliation_number);
    when 'fixed_assets' then
      new.asset_code := public._assign_doc_number(new.company_id, public.doc_prefix('fixed_asset', new.company_id), public.doc_pad('fixed_asset'), new.asset_code);
    when 'depreciation_runs' then
      new.batch_number := public._assign_doc_number(new.company_id, public.doc_prefix('depreciation', new.company_id, new.period), public.doc_pad('depreciation'), new.batch_number);
    when 'employees' then
      new.employee_code := public._assign_doc_number(new.company_id, public.doc_prefix('employee', new.company_id), public.doc_pad('employee'), new.employee_code);
    when 'payroll_runs' then
      if coalesce(btrim(new.payroll_number), '') = '' and new.year is not null and new.month is not null then
        new.payroll_number := 'PR-' || new.year || '-' || lpad(new.month::text, 2, '0');
      end if;
    when 'suppliers' then
      new.supplier_code := public._assign_global_doc_number(public.doc_prefix('supplier', null), public.doc_pad('supplier'), new.supplier_code);
    when 'customers' then
      new.customer_code := public._assign_global_doc_number(public.doc_prefix('customer', null), public.doc_pad('customer'), new.customer_code);
    else
      raise exception 'trg_assign_doc_number: unsupported table %', tg_table_name;
  end case;
  return new;
end $$;

-- RPCs that pre-allocate numbers: payment, journal, maintenance record from a work order
do $$
declare f record; def text; nd text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('record_payment', 'post_journal_entry', 'complete_work_order')
  loop
    def := pg_get_functiondef(f.oid);
    nd := replace(def, $r$public.next_doc_number(inv.company_id, 'PAY-' || extract(year from p_date)::int)$r$,
                       $r$public.next_doc_number(inv.company_id, public.doc_prefix('payment', inv.company_id, p_date), public.doc_pad('payment'))$r$);
    nd := replace(nd, $r$public.next_doc_number(p_company, 'JE-' || extract(year from p_date)::int)$r$,
                      $r$public.next_doc_number(p_company, public.doc_prefix('journal', p_company, p_date), public.doc_pad('journal'))$r$);
    nd := replace(nd, $r$public.next_doc_number(wo.company_id, 'MNT-' || extract(year from current_date)::int, 3)$r$,
                      $r$public.next_doc_number(wo.company_id, public.doc_prefix('maintenance', wo.company_id, current_date), public.doc_pad('maintenance'))$r$);
    if nd <> def then execute nd; end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Vehicle type sync
-- ---------------------------------------------------------------------
create or replace function public.trg_vehicle_type_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.vehicle_types;
begin
  if new.vehicle_type_id is null and coalesce(btrim(new.vehicle_type), '') <> '' then
    select * into t from public.vehicle_types where lower(name) = lower(btrim(new.vehicle_type));
    if not found then raise exception 'Unknown vehicle type "%"; add it under Settings > Vehicle types first', btrim(new.vehicle_type); end if;
    new.vehicle_type_id := t.id;
  end if;
  if new.vehicle_type_id is null then raise exception 'Vehicle type is required'; end if;
  select * into t from public.vehicle_types where id = new.vehicle_type_id;
  if not found then raise exception 'Unknown vehicle type'; end if;
  if tg_op = 'INSERT' and not t.active then raise exception 'Vehicle type % is inactive', t.name; end if;
  new.vehicle_type := t.name;
  if new.number_of_seats is null and t.seat_capacity is not null then new.number_of_seats := t.seat_capacity; end if;
  return new;
end $$;
revoke execute on function public.trg_vehicle_type_sync() from anon, authenticated, public;
drop trigger if exists vehicles_type_sync on public.vehicles;
create trigger vehicles_type_sync before insert or update of vehicle_type, vehicle_type_id on public.vehicles
  for each row execute function public.trg_vehicle_type_sync();

create or replace function public.trg_expense_category_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.expense_categories;
begin
  if new.category_id is null and coalesce(btrim(new.category), '') <> '' then
    select * into c from public.expense_categories where lower(name) = lower(btrim(new.category));
    new.category_id := c.id;
  end if;
  if new.category_id is not null then
    select * into c from public.expense_categories where id = new.category_id;
    if not found then raise exception 'Unknown expense category'; end if;
    new.category := c.name;
    new.gl_account_code := coalesce(nullif(btrim(new.gl_account_code), ''), c.gl_account_code);
    if c.requires_vehicle and new.vehicle_id is null then raise exception 'Expense category % requires a vehicle', c.name; end if;
  end if;
  return new;
end $$;
revoke execute on function public.trg_expense_category_sync() from anon, authenticated, public;
drop trigger if exists expenses_category_sync on public.expenses;
create trigger expenses_category_sync before insert or update of category, category_id on public.expenses
  for each row execute function public.trg_expense_category_sync();

-- ---------------------------------------------------------------------
-- 6. Custom fields engine
-- ---------------------------------------------------------------------
create table if not exists public.field_definitions (
  id              uuid primary key default gen_random_uuid(),
  entity          text not null check (entity in ('office', 'vehicle', 'client', 'supplier', 'employee', 'expense')),
  key             text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label           text not null check (btrim(label) <> ''),
  field_type      text not null check (field_type in ('text', 'number', 'date', 'dropdown', 'file', 'boolean')),
  options         jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  required        boolean not null default false,
  office_id       uuid references public.companies(id) on delete cascade,      -- null = all offices
  vehicle_type_id uuid references public.vehicle_types(id) on delete cascade,  -- vehicle fields only
  help_text       text,
  show_in_list    boolean not null default false,
  sort_order      integer not null default 100,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  check (vehicle_type_id is null or entity = 'vehicle'),
  check (field_type <> 'dropdown' or jsonb_array_length(options) > 0)
);
create unique index if not exists field_definitions_key on public.field_definitions (entity, key);
create index if not exists field_definitions_entity on public.field_definitions (entity, active, sort_order);

-- Per-office visibility: shown (default), required or hidden
create table if not exists public.field_office_settings (
  field_id    uuid not null references public.field_definitions(id) on delete cascade,
  office_id   uuid not null references public.companies(id) on delete cascade,
  visibility  text not null check (visibility in ('shown', 'required', 'hidden')),
  primary key (field_id, office_id)
);

alter table public.vehicles  add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.customers add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.suppliers add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.employees add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.expenses  add column if not exists custom_fields jsonb not null default '{}'::jsonb;
create index if not exists vehicles_custom_fields_gin on public.vehicles using gin (custom_fields);
create index if not exists customers_custom_fields_gin on public.customers using gin (custom_fields);
create index if not exists suppliers_custom_fields_gin on public.suppliers using gin (custom_fields);
create index if not exists employees_custom_fields_gin on public.employees using gin (custom_fields);
create index if not exists expenses_custom_fields_gin on public.expenses using gin (custom_fields);

-- Validates and normalises custom field values for one row. Unknown keys are rejected so typos
-- cannot hide data; hidden fields are left untouched.
create or replace function public.validate_custom_fields(p_entity text, p_company uuid, p_values jsonb, p_vehicle_type uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d record; v jsonb; out jsonb := coalesce(p_values, '{}'::jsonb); vis text; req boolean; missing text[] := '{}'; k text;
begin
  if jsonb_typeof(out) <> 'object' then raise exception 'Custom fields must be an object'; end if;
  for k in select jsonb_object_keys(out) loop
    if not exists (select 1 from public.field_definitions where entity = p_entity and key = k) then
      raise exception 'Unknown custom field "%" for %', k, p_entity;
    end if;
  end loop;
  for d in select f.*, s.visibility from public.field_definitions f
           left join public.field_office_settings s on s.field_id = f.id and s.office_id = p_company
           where f.entity = p_entity and f.active
             and (f.office_id is null or f.office_id = p_company)
             and (f.vehicle_type_id is null or f.vehicle_type_id = p_vehicle_type)
  loop
    vis := coalesce(d.visibility, case when d.required then 'required' else 'shown' end);
    continue when vis = 'hidden';
    req := vis = 'required';
    v := out -> d.key;
    if v is null or v = 'null'::jsonb or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') then
      if req then missing := missing || d.label; end if;
      out := out - d.key;
      continue;
    end if;
    case d.field_type
      when 'number' then
        if jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then
          out := jsonb_set(out, array[d.key], to_jsonb((v #>> '{}')::numeric));
        elsif jsonb_typeof(v) <> 'number' then raise exception '% must be a number', d.label; end if;
      when 'date' then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '% must be a date (YYYY-MM-DD)', d.label; end if;
        perform (v #>> '{}')::date;
      when 'boolean' then
        if jsonb_typeof(v) = 'string' and lower(v #>> '{}') in ('true', 'false', 'yes', 'no') then
          out := jsonb_set(out, array[d.key], to_jsonb(lower(v #>> '{}') in ('true', 'yes')));
        elsif jsonb_typeof(v) <> 'boolean' then raise exception '% must be yes or no', d.label; end if;
      when 'dropdown' then
        if not (d.options ? (v #>> '{}')) then raise exception '% must be one of: %', d.label, (select string_agg(x, ', ') from jsonb_array_elements_text(d.options) x); end if;
      else
        if jsonb_typeof(v) <> 'string' then out := jsonb_set(out, array[d.key], to_jsonb(v #>> '{}')); end if;
        if length(out ->> d.key) > 2000 then raise exception '% is too long', d.label; end if;
    end case;
  end loop;
  if cardinality(missing) > 0 then raise exception 'Required field(s) missing: %', array_to_string(missing, ', '); end if;
  return out;
end $$;
grant execute on function public.validate_custom_fields(text, uuid, jsonb, uuid) to authenticated;

create or replace function public.trg_custom_fields() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_entity text; v_company uuid; v_type uuid;
begin
  if tg_op = 'UPDATE' and new.custom_fields is not distinct from old.custom_fields then return new; end if;
  v_entity := case tg_table_name when 'companies' then 'office' when 'vehicles' then 'vehicle' when 'customers' then 'client'
                                 when 'suppliers' then 'supplier' when 'employees' then 'employee' when 'expenses' then 'expense' end;
  v_company := case tg_table_name when 'companies' then (to_jsonb(new) ->> 'id')::uuid
                                  else nullif(to_jsonb(new) ->> 'company_id', '')::uuid end;
  if tg_table_name in ('customers', 'suppliers') then v_company := nullif(to_jsonb(new) ->> 'office_id', '')::uuid; end if;
  if tg_table_name = 'vehicles' then v_type := (to_jsonb(new) ->> 'vehicle_type_id')::uuid; end if;
  new.custom_fields := public.validate_custom_fields(v_entity, v_company, new.custom_fields, v_type);
  return new;
end $$;
revoke execute on function public.trg_custom_fields() from anon, authenticated, public;
do $$
declare t text;
begin
  foreach t in array array['companies', 'vehicles', 'customers', 'suppliers', 'employees', 'expenses'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_zz_custom_fields', t);
    -- zz_: runs after the type / category sync triggers so vehicle_type_id is resolved
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.trg_custom_fields()', t || '_zz_custom_fields', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. Invitations: role and offices are applied when the invited user first signs up
-- ---------------------------------------------------------------------
create table if not exists public.user_invitations (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name         text,
  role_id      uuid not null references public.roles(id) on delete restrict,
  all_offices  boolean not null default false,
  office_roles jsonb not null default '[]'::jsonb check (jsonb_typeof(office_roles) = 'array'),   -- [{company_id, role_id|null}]
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);
create unique index if not exists user_invitations_pending on public.user_invitations (lower(email)) where status = 'pending';

create or replace function public.create_invitation(p_email text, p_name text, p_role uuid, p_all_offices boolean, p_office_roles jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; a jsonb; v_super boolean := public.is_super_admin();
begin
  if not public.has_perm('users-roles', 'create') then raise exception 'Permission denied' using errcode = '42501'; end if;
  if coalesce(btrim(p_email), '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address'; end if;
  if exists (select 1 from public.profiles where lower(email) = lower(btrim(p_email))) then
    raise exception 'A user with this email already exists; change their role in Users & Roles';
  end if;
  if not exists (select 1 from public.roles where id = p_role) then raise exception 'Choose a role'; end if;
  if not v_super and (p_all_offices or exists (select 1 from public.roles where id = p_role and is_super)) then
    raise exception 'Only a Super Admin can invite Super Admins or organization-wide users';
  end if;
  if not coalesce(p_all_offices, false) and jsonb_array_length(coalesce(p_office_roles, '[]')) = 0
     and not exists (select 1 from public.roles where id = p_role and is_super) then
    raise exception 'Assign at least one office (or organization-wide access)';
  end if;
  for a in select * from jsonb_array_elements(coalesce(p_office_roles, '[]')) loop
    if not public.can_in((a->>'company_id')::uuid, 'users-roles', 'edit') and not v_super then
      raise exception 'Permission denied: you cannot assign an office you do not manage';
    end if;
    if nullif(a->>'role_id', '') is not null and exists (select 1 from public.roles where id = (a->>'role_id')::uuid and is_super) then
      raise exception 'Super Admin cannot be assigned per office';
    end if;
  end loop;
  update public.user_invitations set status = 'revoked' where lower(email) = lower(btrim(p_email)) and status = 'pending';
  insert into public.user_invitations (email, name, role_id, all_offices, office_roles)
  values (lower(btrim(p_email)), nullif(btrim(p_name), ''), p_role, coalesce(p_all_offices, false), coalesce(p_office_roles, '[]'))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.create_invitation(text, text, uuid, boolean, jsonb) from anon, public;
grant execute on function public.create_invitation(text, text, uuid, boolean, jsonb) to authenticated;

create or replace function public.revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('users-roles', 'edit') then raise exception 'Permission denied' using errcode = '42501'; end if;
  update public.user_invitations set status = 'revoked' where id = p_id and status = 'pending';
  if not found then raise exception 'Invitation not found or no longer pending'; end if;
end $$;
revoke execute on function public.revoke_invitation(uuid) from anon, public;
grant execute on function public.revoke_invitation(uuid) to authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare inv public.user_invitations; a jsonb;
begin
  select * into inv from public.user_invitations where lower(email) = lower(new.email) and status = 'pending'
  order by created_at desc limit 1;
  insert into public.profiles (id, name, email, role_id, all_offices)
  values (new.id, coalesce(inv.name, new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email,
          coalesce(inv.role_id, (select id from public.roles where name = 'Viewer')), coalesce(inv.all_offices, false))
  on conflict (id) do nothing;
  if inv.id is not null then
    for a in select * from jsonb_array_elements(inv.office_roles) loop
      insert into public.company_members (user_id, company_id, role_id)
      select new.id, c.id, nullif(a->>'role_id', '')::uuid from public.companies c where c.id = (a->>'company_id')::uuid
      on conflict (user_id, company_id) do nothing;
    end loop;
    update public.user_invitations set status = 'accepted', accepted_at = now() where id = inv.id;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 8. Setup progress and completion
-- ---------------------------------------------------------------------
create or replace function public.save_setup_progress(p_step integer, p_completed integer[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Only a Super Admin can run the Setup Wizard' using errcode = '42501'; end if;
  update public.organizations set setup_step = greatest(1, least(9, p_step)),
         setup_completed_steps = (select coalesce(array_agg(distinct s order by s), '{}') from unnest(coalesce(p_completed, '{}')) s where s between 1 and 9);
  if not found then raise exception 'Create the organization profile first'; end if;
end $$;
revoke execute on function public.save_setup_progress(integer, integer[]) from anon, public;
grant execute on function public.save_setup_progress(integer, integer[]) to authenticated;

-- Readiness checks shown on the review screen; complete_setup refuses while any check fails
create or replace function public.setup_checklist() returns table (check_key text, label text, ok boolean, detail text)
language sql stable security definer set search_path = public as $$
  select * from (values
    ('organization', 'Organization profile (legal name, base currency, financial year)',
      exists (select 1 from public.organizations where btrim(legal_name) <> '' and base_currency is not null), null::text),
    ('tax_rates', 'At least one tax rate (0% is allowed)', exists (select 1 from public.tax_rates where active), null),
    ('payment_terms', 'At least one payment term', exists (select 1 from public.payment_terms where active), null),
    ('document_formats', 'Document number formats', (select count(*) from public.document_formats) >= 10, null),
    ('offices', 'At least one active office', exists (select 1 from public.companies where active), null),
    ('chart_of_accounts', 'Every office has a chart of accounts',
      not exists (select 1 from public.companies c where c.active and not exists (select 1 from public.accounts a where a.company_id = c.id)),
      (select string_agg(c.name, ', ') from public.companies c where c.active and not exists (select 1 from public.accounts a where a.company_id = c.id))),
    ('roles', 'Roles and permissions', exists (select 1 from public.role_grants), null),
    ('vehicle_types', 'At least one active vehicle type', exists (select 1 from public.vehicle_types where active), null),
    ('expense_categories', 'At least one active expense category', exists (select 1 from public.expense_categories where active), null)
  ) v(check_key, label, ok, detail)
$$;
revoke execute on function public.setup_checklist() from anon, public;
grant execute on function public.setup_checklist() to authenticated;

create or replace function public.complete_setup() returns void
language plpgsql security definer set search_path = public as $$
declare v_fail text;
begin
  if not public.is_super_admin() then raise exception 'Only a Super Admin can finish the Setup Wizard' using errcode = '42501'; end if;
  select string_agg(label, '; ') into v_fail from public.setup_checklist() where not ok;
  if v_fail is not null then raise exception 'Setup is not complete: %', v_fail; end if;
  update public.organizations set setup_status = 'completed', setup_completed_at = now(), setup_completed_by = auth.uid(),
         setup_step = 9, setup_completed_steps = '{1,2,3,4,5,6,7,8,9}';
end $$;
revoke execute on function public.complete_setup() from anon, public;
grant execute on function public.complete_setup() to authenticated;

-- ---------------------------------------------------------------------
-- 9. Opening balances (wizard step 8, also Settings -> Opening balances)
--    Banks: created with opening_balance + opening_date (posted by the bank trigger).
--    Parties: an opening-balance invoice per party, posted against 3900, so statements,
--             aging and payments treat the balance like any other open invoice.
--    Fixed assets: asset at cost with accumulated depreciation; Dr asset / Cr acc. dep. / Cr 3900.
-- ---------------------------------------------------------------------
create or replace function public.post_opening_party_balance(p_company uuid, p_party_type public.party_type, p_party uuid,
  p_amount numeric, p_date date, p_due_date date default null, p_reference text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv uuid;
begin
  if not public.can_in(p_company, 'invoices', 'create') or not public.can_in(p_company, 'accounting', 'create') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Opening balance must be greater than zero'; end if;
  if p_date is null then raise exception 'Opening balance date is required'; end if;
  if p_party_type = 'Customer' and not exists (select 1 from public.customers where id = p_party) then raise exception 'Customer not found'; end if;
  if p_party_type = 'Supplier' and not exists (select 1 from public.suppliers where id = p_party) then raise exception 'Supplier not found'; end if;
  perform public.ensure_system_account(p_company, '3900', 'Opening Balance Equity', 'Equity', 'Equity');
  insert into public.invoices (company_id, invoice_number, invoice_type, party_type, supplier_id, customer_id, invoice_date, due_date,
                               reference_number, notes, payment_terms_days)
  values (p_company, null, case p_party_type when 'Customer' then 'Sales' else 'Purchase' end::public.invoice_type, p_party_type,
          case when p_party_type = 'Supplier' then p_party end, case when p_party_type = 'Customer' then p_party end,
          p_date, coalesce(p_due_date, p_date), coalesce(nullif(btrim(p_reference), ''), 'OPENING'), 'Opening balance at go-live', 0)
  returning id into v_inv;
  insert into public.invoice_lines (invoice_id, line_no, description, quantity, unit_price, tax_rate_percentage, gl_account_code)
  values (v_inv, 1, 'Opening balance', 1, round(p_amount, 3), 0, '3900');
  perform public.post_invoice(v_inv);
  return v_inv;
end $$;
revoke execute on function public.post_opening_party_balance(uuid, public.party_type, uuid, numeric, date, date, text) from anon, public;
grant execute on function public.post_opening_party_balance(uuid, public.party_type, uuid, numeric, date, date, text) to authenticated;

create or replace function public.post_opening_fixed_asset(p_company uuid, p_asset jsonb, p_date date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cost numeric; v_acc numeric; v_asset_gl text; v_acc_gl text;
begin
  if not public.can_in(p_company, 'fixed-assets', 'create') or not public.can_in(p_company, 'accounting', 'create') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  v_cost := round(coalesce((p_asset->>'purchase_cost')::numeric, 0), 3);
  v_acc  := round(coalesce((p_asset->>'accumulated_depreciation')::numeric, 0), 3);
  v_asset_gl := coalesce(nullif(p_asset->>'gl_asset_account', ''), '1510');
  v_acc_gl   := coalesce(nullif(p_asset->>'gl_accum_dep_account', ''), '1520');
  if coalesce(btrim(p_asset->>'name'), '') = '' then raise exception 'Asset name is required'; end if;
  if v_cost <= 0 then raise exception 'Asset cost must be greater than zero'; end if;
  if v_acc < 0 or v_acc > v_cost then raise exception 'Accumulated depreciation must be between 0 and the cost'; end if;
  if p_date is null then raise exception 'Opening balance date is required'; end if;
  insert into public.fixed_assets (company_id, asset_code, name, category, serial_number, purchase_date, purchase_cost, salvage_value,
      useful_life_years, annual_rate_percentage, depreciation_method, accumulated_depreciation, gl_asset_account,
      gl_expense_account, gl_accum_dep_account, location, notes)
  values (p_company, '', btrim(p_asset->>'name'), coalesce(nullif(p_asset->>'category', ''), 'Motor Vehicles'),
      nullif(p_asset->>'serial_number', ''), coalesce(nullif(p_asset->>'purchase_date', '')::date, p_date), v_cost,
      coalesce(nullif(p_asset->>'salvage_value', '')::numeric, 0), coalesce(nullif(p_asset->>'useful_life_years', '')::numeric, 5),
      round(100 / coalesce(nullif(p_asset->>'useful_life_years', '')::numeric, 5), 3),
      coalesce(nullif(p_asset->>'depreciation_method', ''), 'Straight-Line'), v_acc, v_asset_gl,
      coalesce(nullif(p_asset->>'gl_expense_account', ''), '5080'), v_acc_gl, nullif(p_asset->>'location', ''), 'Opening balance at go-live')
  returning id into v_id;
  perform public.ensure_system_account(p_company, '3900', 'Opening Balance Equity', 'Equity', 'Equity');
  perform public.post_journal_entry(p_company, p_date, 'Opening balance fixed asset ' || btrim(p_asset->>'name'),
    jsonb_build_array(
      jsonb_build_object('account_code', v_asset_gl, 'debit', v_cost),
      jsonb_build_object('account_code', v_acc_gl, 'credit', v_acc),
      jsonb_build_object('account_code', '3900', 'credit', v_cost - v_acc)),
    null, 'Opening Balance', v_id);
  return v_id;
end $$;
revoke execute on function public.post_opening_fixed_asset(uuid, jsonb, date) from anon, public;
grant execute on function public.post_opening_fixed_asset(uuid, jsonb, date) to authenticated;

-- bank opening journals use the opening date when given
create or replace function public.trg_bank_opening_balance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.opening_balance is distinct from old.opening_balance
     and coalesce(current_setting('erp.bank_ob_adjust', true), '') <> 'on' then
    raise exception 'Change a bank opening balance with adjust_bank_opening_balance(), which posts the difference';
  end if;
  if tg_op = 'INSERT' and coalesce(new.opening_balance, 0) <> 0 then
    if not exists (select 1 from public.accounts where company_id = new.company_id and code = new.gl_account_code) then
      raise exception 'GL account % is not in this office''s chart of accounts', new.gl_account_code;
    end if;
    perform public.ensure_system_account(new.company_id, '3900', 'Opening Balance Equity', 'Equity', 'Equity');
    perform public.post_journal_entry(new.company_id, coalesce(new.opening_date, new.created_at::date, current_date),
      'Opening balance ' || new.bank_name || ' ' || new.account_number,
      jsonb_build_array(
        jsonb_build_object('account_code', new.gl_account_code, 'bank_account_id', new.id,
          case when new.opening_balance > 0 then 'debit' else 'credit' end, abs(new.opening_balance)),
        jsonb_build_object('account_code', '3900',
          case when new.opening_balance > 0 then 'credit' else 'debit' end, abs(new.opening_balance))),
      null, 'Opening Balance', new.id);
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- 10. RLS and grants
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['organizations', 'tax_rates', 'payment_terms', 'units', 'document_formats', 'fee_schedules', 'fee_items',
                           'vehicle_types', 'expense_categories', 'recurring_expenses', 'field_definitions', 'field_office_settings',
                           'user_invitations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- organization: readable by every signed-in user (branding, currency); written by settings admins
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated using (true);
drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert on public.organizations for insert to authenticated with check ((select public.is_super_admin()));
drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations for update to authenticated
  using ((select public.has_perm('settings', 'edit'))) with check ((select public.has_perm('settings', 'edit')));
grant select, insert, update on public.organizations to authenticated;

-- master data: read by everyone signed in, written with settings:edit (vehicle types also by vehicles:edit)
do $$
declare r record;
begin
  for r in select * from (values ('tax_rates', 'settings'), ('payment_terms', 'settings'), ('units', 'settings'),
                                 ('document_formats', 'settings'), ('fee_schedules', 'settings'), ('fee_items', 'settings'),
                                 ('vehicle_types', 'settings'), ('expense_categories', 'settings'), ('field_definitions', 'settings'),
                                 ('field_office_settings', 'settings')) as m(tbl, module)
  loop
    execute format('drop policy if exists %I on public.%I', r.tbl || '_select', r.tbl);
    execute format('create policy %I on public.%I for select to authenticated using (true)', r.tbl || '_select', r.tbl);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_insert', r.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.has_perm(%L, ''edit'')))', r.tbl || '_insert', r.tbl, r.module);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_update', r.tbl);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.has_perm(%L, ''edit''))) with check ((select public.has_perm(%L, ''edit'')))', r.tbl || '_update', r.tbl, r.module, r.module);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_delete', r.tbl);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.has_perm(%L, ''edit'')))', r.tbl || '_delete', r.tbl, r.module);
    execute format('grant select, insert, update, delete on public.%I to authenticated', r.tbl);
  end loop;
end $$;
-- document formats can be edited but not added or removed (the numbering code knows the types)
drop policy if exists document_formats_insert on public.document_formats;
drop policy if exists document_formats_delete on public.document_formats;
revoke insert, delete on public.document_formats from authenticated;

-- recurring expense templates are office data (expenses module)
drop policy if exists recurring_expenses_select on public.recurring_expenses;
create policy recurring_expenses_select on public.recurring_expenses for select to authenticated
  using (company_id = any((select public.perm_company_ids('expenses', 'view'))::uuid[]));
drop policy if exists recurring_expenses_insert on public.recurring_expenses;
create policy recurring_expenses_insert on public.recurring_expenses for insert to authenticated
  with check (company_id = any((select public.perm_company_ids('expenses', 'create'))::uuid[]));
drop policy if exists recurring_expenses_update on public.recurring_expenses;
create policy recurring_expenses_update on public.recurring_expenses for update to authenticated
  using (company_id = any((select public.perm_company_ids('expenses', 'edit'))::uuid[]))
  with check (company_id = any((select public.perm_company_ids('expenses', 'edit'))::uuid[]));
drop policy if exists recurring_expenses_delete on public.recurring_expenses;
create policy recurring_expenses_delete on public.recurring_expenses for delete to authenticated
  using (company_id = any((select public.perm_company_ids('expenses', 'delete'))::uuid[]));
grant select, insert, update, delete on public.recurring_expenses to authenticated;

-- invitations: visible to user admins, written through the RPCs only
drop policy if exists user_invitations_select on public.user_invitations;
create policy user_invitations_select on public.user_invitations for select to authenticated
  using ((select public.has_perm('users-roles', 'view')));
grant select on public.user_invitations to authenticated;

-- system rows (defaults) cannot be deleted from the app; deactivate them instead
create or replace function public.trg_protect_system_rows() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.is_system then
    raise exception 'Default % cannot be deleted; mark it inactive instead', replace(tg_table_name, '_', ' ');
  end if;
  return old;
end $$;
revoke execute on function public.trg_protect_system_rows() from anon, authenticated, public;
drop trigger if exists vehicle_types_protect on public.vehicle_types;
create trigger vehicle_types_protect before delete on public.vehicle_types for each row execute function public.trg_protect_system_rows();
drop trigger if exists expense_categories_protect on public.expense_categories;
create trigger expense_categories_protect before delete on public.expense_categories for each row execute function public.trg_protect_system_rows();

-- audit trail for configuration
do $$
declare t text;
begin
  foreach t in array array['organizations', 'tax_rates', 'payment_terms', 'document_formats', 'fee_schedules', 'fee_items',
                           'vehicle_types', 'expense_categories', 'recurring_expenses', 'field_definitions', 'user_invitations'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.trg_audit()', t || '_audit', t);
  end loop;
end $$;

-- touch updated_at
drop trigger if exists organizations_touch on public.organizations;

-- organization logo: media bucket, path organization/<file>; readable by every signed-in user
-- (letterheads, sidebar), written by settings editors
drop policy if exists media_org_read on storage.objects;
create policy media_org_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and split_part(name, '/', 1) = 'organization');
drop policy if exists media_org_upload on storage.objects;
create policy media_org_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and split_part(name, '/', 1) = 'organization' and (select public.has_perm('settings', 'edit')));
drop policy if exists media_org_delete on storage.objects;
create policy media_org_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and split_part(name, '/', 1) = 'organization' and (select public.has_perm('settings', 'edit')));

-- expense categories must post to an expense account of the chart-of-accounts template
create or replace function public.trg_expense_category_gl() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.account_templates where code = new.gl_account_code and category = 'Expense') then
    raise exception 'GL account % is not an expense account in the chart of accounts', new.gl_account_code;
  end if;
  return new;
end $$;
revoke execute on function public.trg_expense_category_gl() from anon, authenticated, public;
drop trigger if exists expense_categories_gl on public.expense_categories;
create trigger expense_categories_gl before insert or update of gl_account_code on public.expense_categories
  for each row execute function public.trg_expense_category_gl();
