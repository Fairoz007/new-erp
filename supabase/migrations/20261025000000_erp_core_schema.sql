-- =====================================================================
-- ERP core schema: tenancy, auth/RBAC, master data, fleet, finance, HR
-- Design notes: docs/SUPABASE_MIGRATION_PLAN.md
--   * Every business row is scoped by company_id (offices). Suppliers and
--     customers are group-level master data shared across offices.
--   * Balances (invoice outstanding, bank, party, GL accounts) are DERIVED
--     in the database (generated columns, triggers, views), never written
--     by the client.
--   * Financial writes that must be atomic go through RPC functions
--     (record_payment, post_journal_entry, decide_approval, ...).
--   * legacy_id keeps the old localStorage string id for the one-time import.
-- =====================================================================

-- gen_random_uuid() is built in (PostgreSQL 13+)

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
create type public.user_role as enum (
  'Super Admin','Company Admin','Fleet Manager','Maintenance Manager',
  'Accountant','Finance Manager','Procurement','Management','Viewer');
create type public.permission_action as enum ('view','create','edit','delete','approve','export','print');
create type public.account_category as enum ('Asset','Liability','Equity','Revenue','Expense');
create type public.invoice_type as enum ('Purchase','Sales');
create type public.party_type as enum ('Supplier','Customer');

-- ---------------------------------------------------------------------
-- 2. Tenancy & identity
-- ---------------------------------------------------------------------
create table public.companies (
  id                  uuid primary key default gen_random_uuid(),
  legacy_id           text unique,
  name                text not null,
  code                text not null unique,
  registration_number text,
  vat_number          text,
  tax_number          text,
  address             text, country text, state text, city text, postal_code text,
  phone text, email text, website text, logo text,
  currency            text not null default 'OMR' check (currency in ('OMR','USD','EUR','SAR','AED')),
  financial_year      text,
  bank_details        jsonb not null default '{}'::jsonb,
  notes               text,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One row per auth user. Role lives here (NOT in user_metadata, which users can edit).
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  legacy_id   text unique,
  name        text not null,
  email       text not null,
  role        public.user_role not null default 'Viewer',
  department  text,
  phone       text,
  avatar      text,
  status      text not null default 'active' check (status in ('active','inactive')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Which offices a user may see. Super Admin sees all without membership rows.
create table public.company_members (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, company_id)
);

-- Single source of truth for the permission matrix (replaces hard-coded AuthContext + UsersRolesPage).
create table public.role_permissions (
  role    public.user_role not null,
  module  text not null,
  action  public.permission_action not null,
  primary key (role, module, action)
);

-- Approval thresholds (mirrors AuthContext.canApprove; editable by admins).
create table public.approval_limits (
  role        public.user_role not null,
  module      text not null check (module in ('maintenance','invoice','expense')),
  max_amount  numeric(14,3),           -- null = unlimited
  primary key (role, module)
);

-- ---------------------------------------------------------------------
-- 3. Auth helper functions (SECURITY DEFINER so RLS can call them without recursion)
-- ---------------------------------------------------------------------
create or replace function public.app_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'Super Admin', false)
$$;

create or replace function public.has_company_access(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from public.company_members m
                 join public.profiles p on p.id = m.user_id and p.status = 'active'
                 where m.user_id = auth.uid() and m.company_id = cid)
$$;

create or replace function public.has_perm(p_module text, p_action public.permission_action) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from public.role_permissions rp
                 where rp.role = public.app_role() and rp.module = p_module and rp.action = p_action)
$$;

create or replace function public.can_approve(p_module text, p_amount numeric) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
      or exists (select 1 from public.approval_limits l
                 where l.role = public.app_role() and l.module = p_module
                   and (l.max_amount is null or p_amount <= l.max_amount))
$$;

-- New auth users get a Viewer profile; admins promote them. Self-signup should be disabled in Auth settings.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users may edit their own name/phone/avatar but never their role or status.
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and auth.uid() is not null                      -- SQL editor / service role (server-side) may bootstrap admins
     and not public.has_perm('users-roles', 'edit') then
    raise exception 'Only administrators can change role or status';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------
-- 4. Document numbering (gap-free per company/prefix, concurrency-safe)
-- ---------------------------------------------------------------------
create table public.doc_sequences (
  company_id uuid not null references public.companies(id) on delete cascade,
  prefix     text not null,
  last_value integer not null default 0,
  primary key (company_id, prefix)
);

create or replace function public.next_doc_number(p_company uuid, p_prefix text, p_pad int default 4)
returns text language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into public.doc_sequences (company_id, prefix, last_value) values (p_company, p_prefix, 1)
  on conflict (company_id, prefix) do update set last_value = doc_sequences.last_value + 1
  returning last_value into v;
  return p_prefix || '-' || lpad(v::text, p_pad, '0');
end $$;

-- ---------------------------------------------------------------------
-- 5. Master data
-- ---------------------------------------------------------------------
create table public.suppliers (
  id                 uuid primary key default gen_random_uuid(),
  legacy_id          text unique,
  supplier_code      text not null unique,          -- was supplierId (SUP-001)
  name               text not null,
  supplier_type      text not null,
  contact_person text, phone text, email text, address text, city text, country text,
  vat_number text, tax_number text,
  payment_terms_days integer not null default 30 check (payment_terms_days >= 0),
  credit_limit       numeric(14,3) not null default 0 check (credit_limit >= 0),
  bank_details       jsonb not null default '{}'::jsonb,
  opening_balance    numeric(14,3) not null default 0,
  status             text not null default 'Active' check (status in ('Active','Inactive','Blocked')),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  legacy_id          text unique,
  customer_code      text not null unique,          -- was customerId (CUST-001)
  name               text not null,
  customer_type      text not null check (customer_type in ('Corporate','Individual','Government','Partner')),
  contact_person text, phone text, email text, address text, city text, country text,
  vat_number text, tax_number text,
  payment_terms_days integer not null default 30 check (payment_terms_days >= 0),
  credit_limit       numeric(14,3) not null default 0 check (credit_limit >= 0),
  opening_balance    numeric(14,3) not null default 0,
  status             text not null default 'Active' check (status in ('Active','Inactive')),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Chart of accounts is per company so P&L / balance sheet can be filtered by office.
create table public.accounts (
  company_id   uuid not null references public.companies(id) on delete cascade,
  code         text not null,
  name         text not null,
  category     public.account_category not null,
  subcategory  text not null,
  currency     text not null default 'OMR',
  description  text,
  is_system    boolean not null default false,
  opening_balance numeric(14,3) not null default 0,  -- debit-positive for Asset/Expense, credit-positive otherwise
  primary key (company_id, code)
);

create table public.bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  legacy_id       text unique,
  company_id      uuid not null references public.companies(id) on delete restrict,
  bank_name       text not null,
  account_name    text not null,
  account_number  text not null,
  iban            text,
  currency        text not null default 'OMR',
  account_type    text not null check (account_type in ('Current','Savings','Petty Cash','Credit Facility')),
  gl_account_code text not null default '1010',
  opening_balance numeric(14,3) not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Fleet
-- ---------------------------------------------------------------------
create table public.vehicles (
  id                       uuid primary key default gen_random_uuid(),
  legacy_id                text unique,
  company_id               uuid not null references public.companies(id) on delete restrict,
  vehicle_code             text not null,            -- was vehicleId (VH-001)
  plate_number             text not null,
  registration_number      text,
  vin                      text,
  engine_number            text,
  vehicle_type             text not null,
  vehicle_category         text not null,
  brand text not null, manufacturer text, model text not null, variant text,
  manufacturing_year       integer check (manufacturing_year between 1950 and 2100),
  registration_date        date,
  registration_expiry_date date,
  country_of_registration  text,
  color text,
  fuel_type                text not null check (fuel_type in ('Petrol','Diesel','Hybrid','Electric','CNG')),
  transmission             text not null,
  engine_capacity_cc       integer check (engine_capacity_cc >= 0),
  number_of_seats          integer check (number_of_seats >= 0),
  current_mileage          integer not null default 0 check (current_mileage >= 0),
  initial_odometer         integer not null default 0 check (initial_odometer >= 0),
  status                   text not null default 'Active'
                           check (status in ('Active','Under Maintenance','Accident','Inactive','Sold','Scrapped','Reserved')),
  photo_url                text,
  assigned_driver text, department text, location text,
  purchase                 jsonb not null default '{}'::jsonb,   -- VehiclePurchaseDetails
  depreciation             jsonb not null default '{}'::jsonb,   -- VehicleDepreciationConfig
  oil_config               jsonb not null default '{}'::jsonb,   -- OilConfig
  current_market_value     numeric(14,3) not null default 0,
  market_value_updated_date date,
  insurance_provider text, insurance_policy_number text,
  insurance_expiry_date    date,
  insurance_premium_annual numeric(14,3) not null default 0,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (company_id, plate_number),
  unique (company_id, vehicle_code)
);

create table public.tyres (
  id                   uuid primary key default gen_random_uuid(),
  legacy_id            text unique,
  company_id           uuid not null references public.companies(id),
  vehicle_id           uuid not null references public.vehicles(id) on delete restrict,
  brand text not null, model text, size text, serial_number text,
  position             text not null check (position in ('Front Left','Front Right','Rear Left','Rear Right','Spare')),
  purchase_date date, purchase_cost numeric(14,3) not null default 0 check (purchase_cost >= 0),
  installation_date date, installation_mileage integer, expected_life_km integer,
  current_mileage integer, tread_depth_mm numeric(5,2) check (tread_depth_mm >= 0),
  replacement_date date, replacement_mileage integer,
  supplier_id          uuid references public.suppliers(id),
  invoice_number       text,
  status               text not null check (status in ('Good','Fair','Due Soon','Critical','Replaced','Scrapped')),
  notes text,
  created_at           timestamptz not null default now()
);

create table public.tyre_events (
  id                 uuid primary key default gen_random_uuid(),
  legacy_id          text unique,
  company_id         uuid not null references public.companies(id),
  vehicle_id         uuid not null references public.vehicles(id) on delete restrict,
  date               date not null,
  event_type         text not null check (event_type in ('Installation','Rotation','Alignment','Balancing','Puncture Repair','Replacement')),
  odometer           integer,
  positions_affected text[] not null default '{}',
  cost               numeric(14,3) not null default 0 check (cost >= 0),
  supplier_id        uuid references public.suppliers(id),
  invoice_number text, technician text, notes text,
  created_at         timestamptz not null default now()
);

create table public.oil_changes (
  id                       uuid primary key default gen_random_uuid(),
  legacy_id                text unique,
  company_id               uuid not null references public.companies(id),
  vehicle_id               uuid not null references public.vehicles(id) on delete restrict,
  date                     date not null,
  odometer                 integer not null check (odometer >= 0),
  oil_type text, oil_brand text, oil_grade text,
  quantity_litres          numeric(8,2) check (quantity_litres >= 0),
  oil_cost numeric(14,3) not null default 0, filter_cost numeric(14,3) not null default 0,
  labour_cost numeric(14,3) not null default 0, tax numeric(14,3) not null default 0,
  total_cost               numeric(14,3) not null check (total_cost >= 0),
  supplier_id              uuid references public.suppliers(id),
  invoice_number           text,
  next_oil_change_mileage  integer,
  next_oil_change_date     date,
  performed_by text, notes text,
  created_at               timestamptz not null default now()
);

create table public.work_orders (
  id                  uuid primary key default gen_random_uuid(),
  legacy_id           text unique,
  company_id          uuid not null references public.companies(id),
  work_order_number   text not null,
  vehicle_id          uuid not null references public.vehicles(id) on delete restrict,
  reported_date       date not null,
  problem_description text not null,
  requested_by        uuid references public.profiles(id),
  assigned_technician text,
  workshop            text,
  supplier_id         uuid references public.suppliers(id),
  priority            text not null check (priority in ('Low','Medium','High','Critical')),
  status              text not null default 'Requested'
                      check (status in ('Draft','Requested','Approved','Scheduled','In Progress','Waiting for Parts','Completed','Cancelled')),
  expected_completion date,
  actual_completion   date,
  estimated_cost      numeric(14,3) not null default 0 check (estimated_cost >= 0),
  parts_charges numeric(14,3) not null default 0, labour_charges numeric(14,3) not null default 0,
  additional_charges numeric(14,3) not null default 0, tax numeric(14,3) not null default 0,
  final_cost          numeric(14,3) not null default 0 check (final_cost >= 0),
  parts_required      text,
  approval_status     text not null default 'Not Required' check (approval_status in ('Not Required','Pending','Approved','Rejected')),
  invoice_number text, notes text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (company_id, work_order_number),
  -- the bug fixed in the audit, now enforced by the database:
  check (status <> 'Completed' or approval_status in ('Not Required','Approved'))
);

create table public.maintenance_records (
  id                    uuid primary key default gen_random_uuid(),
  legacy_id             text unique,
  company_id            uuid not null references public.companies(id),
  record_number         text not null,
  vehicle_id            uuid not null references public.vehicles(id) on delete restrict,
  work_order_id         uuid unique references public.work_orders(id),  -- unique: one record per WO (no duplicates)
  maintenance_date      date not null,
  maintenance_type      text not null,
  category              text not null,
  description           text not null,
  odometer_reading      integer check (odometer_reading >= 0),
  service_centre        text,
  supplier_id           uuid references public.suppliers(id),
  technician text, invoice_number text,
  parts_cost numeric(14,3) not null default 0 check (parts_cost >= 0),
  labour_cost numeric(14,3) not null default 0 check (labour_cost >= 0),
  tax numeric(14,3) not null default 0 check (tax >= 0),
  discount numeric(14,3) not null default 0 check (discount >= 0),
  other_charges numeric(14,3) not null default 0,
  total_cost            numeric(14,3) not null check (total_cost >= 0),
  payment_status        text not null default 'Unpaid' check (payment_status in ('Unpaid','Partially Paid','Paid')),
  payment_method text,
  next_service_date date, next_service_mileage integer,
  warranty_period_months integer, warranty_expiry_date date,
  parts_used            jsonb not null default '[]'::jsonb,
  attachments           jsonb not null default '[]'::jsonb,   -- [{name,type,storage_path}]
  notes text,
  created_at            timestamptz not null default now(),
  unique (company_id, record_number)
);

create table public.accidents (
  id                        uuid primary key default gen_random_uuid(),
  legacy_id                 text unique,
  company_id                uuid not null references public.companies(id),
  accident_number           text not null,
  vehicle_id                uuid not null references public.vehicles(id) on delete restrict,
  accident_date date not null, accident_time time,
  location text, driver_name text,
  accident_description text, accident_type text not null, damage_description text,
  police_report_number text, insurance_claim_number text, third_party_details text,
  estimated_repair_cost     numeric(14,3) not null default 0 check (estimated_repair_cost >= 0),
  actual_repair_cost        numeric(14,3) not null default 0 check (actual_repair_cost >= 0),
  insurance_contribution    numeric(14,3) not null default 0 check (insurance_contribution >= 0),
  company_contribution      numeric(14,3) not null default 0,
  third_party_contribution  numeric(14,3) not null default 0,
  net_cost_to_company       numeric(14,3) generated always as
                            (actual_repair_cost - insurance_contribution - third_party_contribution) stored,
  workshop text,
  supplier_id               uuid references public.suppliers(id),
  repair_start_date date, repair_completion_date date,
  vehicle_downtime_days     integer not null default 0 check (vehicle_downtime_days >= 0),
  status                    text not null default 'Reported'
                            check (status in ('Reported','Under Investigation','Insurance Processing','Repair Approved','Under Repair','Completed','Closed')),
  attachments               jsonb not null default '[]'::jsonb,
  notes text,
  created_at                timestamptz not null default now(),
  unique (company_id, accident_number)
);

create table public.expenses (
  id               uuid primary key default gen_random_uuid(),
  legacy_id        text unique,
  company_id       uuid not null references public.companies(id),
  expense_number   text not null,
  vehicle_id       uuid references public.vehicles(id) on delete restrict,
  date             date not null,
  category         text not null,
  supplier_id      uuid references public.suppliers(id),
  description      text not null,
  quantity         numeric(12,3) not null default 1 check (quantity > 0),
  unit_price       numeric(14,3) not null check (unit_price >= 0),
  tax              numeric(14,3) not null default 0 check (tax >= 0),
  total            numeric(14,3) not null check (total >= 0),
  payment_method   text not null,
  invoice_number text, receipt_number text,
  cost_centre      text,
  gl_account_code  text,
  attachment_path  text,              -- storage object path in bucket 'documents'
  notes text,
  created_at       timestamptz not null default now(),
  unique (company_id, expense_number)
);

create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  legacy_id      text unique,
  company_id     uuid not null references public.companies(id),
  document_name  text not null,
  document_number text,
  category       text not null,
  vehicle_id     uuid references public.vehicles(id) on delete set null,
  issue_date date, expiry_date date,
  storage_path   text,                -- replaces data URLs in localStorage
  file_size      bigint check (file_size between 0 and 10485760),
  mime_type      text check (mime_type is null or mime_type in ('application/pdf','image/png','image/jpeg')),
  uploaded_by    uuid references public.profiles(id) default auth.uid(),
  uploaded_at    timestamptz not null default now(),
  notes text
);

create table public.vehicle_timeline (
  id             uuid primary key default gen_random_uuid(),
  legacy_id      text unique,
  company_id     uuid not null references public.companies(id),
  vehicle_id     uuid not null references public.vehicles(id) on delete cascade,
  date           date not null,
  title          text not null,
  description    text,
  amount         numeric(14,3),
  currency       text,
  category       text not null,
  reference_id   uuid,
  reference_type text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. Finance: invoices, payments, reconciliation, GL
-- ---------------------------------------------------------------------
create table public.invoices (
  id                    uuid primary key default gen_random_uuid(),
  legacy_id             text unique,
  company_id            uuid not null references public.companies(id),
  invoice_number        text not null,
  invoice_type          public.invoice_type not null,
  party_type            public.party_type not null,
  supplier_id           uuid references public.suppliers(id),
  customer_id           uuid references public.customers(id),
  party_snapshot        jsonb not null default '{}'::jsonb,  -- name/vat/address as printed on the document
  invoice_date          date not null,
  due_date              date not null,
  reference_number text, purchase_order_number text,
  work_order_id         uuid references public.work_orders(id),
  maintenance_record_id uuid references public.maintenance_records(id),
  vehicle_id            uuid references public.vehicles(id),
  cost_centre           text,
  currency              text not null default 'OMR',
  exchange_rate         numeric(12,6) not null default 1 check (exchange_rate > 0),
  -- totals are maintained from invoice_lines by trigger; client cannot set them
  subtotal              numeric(14,3) not null default 0,
  discount_total        numeric(14,3) not null default 0,
  tax_total             numeric(14,3) not null default 0,
  other_charges         numeric(14,3) not null default 0 check (other_charges >= 0),
  grand_total           numeric(14,3) not null default 0,
  amount_paid           numeric(14,3) not null default 0,   -- maintained from payments by trigger
  credited_amount       numeric(14,3) not null default 0,   -- maintained from credit notes by trigger
  outstanding_amount    numeric(14,3) generated always as (grand_total - amount_paid - credited_amount) stored,
  payment_status        text not null default 'Unpaid' check (payment_status in ('Unpaid','Partially Paid','Paid','Overdue','Cancelled')),
  approval_status       text not null default 'Draft' check (approval_status in ('Draft','Pending Approval','Approved','Rejected','Cancelled')),
  approved_by           uuid references public.profiles(id),
  approval_date         timestamptz,
  attachment_path       text,
  payment_terms_days    integer not null default 30,
  terms_and_conditions text, notes text,
  is_credit_note        boolean not null default false,
  parent_invoice_id     uuid references public.invoices(id),
  journal_entry_id      uuid,                                -- FK added after journal_entries
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (company_id, invoice_number),
  check (due_date >= invoice_date),
  check ((party_type = 'Supplier' and supplier_id is not null and customer_id is null)
      or (party_type = 'Customer' and customer_id is not null and supplier_id is null)),
  check (not is_credit_note or parent_invoice_id is not null),
  check (amount_paid >= 0 and credited_amount >= 0 and amount_paid + credited_amount <= grand_total + 0.0005)
);

create table public.invoice_lines (
  id                   uuid primary key default gen_random_uuid(),
  invoice_id           uuid not null references public.invoices(id) on delete cascade,
  line_no              integer not null,
  item_code            text,
  description          text not null,
  quantity             numeric(12,3) not null check (quantity > 0),
  unit                 text,
  unit_price           numeric(14,3) not null check (unit_price >= 0),
  discount_percentage  numeric(5,2) not null default 0 check (discount_percentage between 0 and 100),
  tax_rate_percentage  numeric(5,2) not null default 0 check (tax_rate_percentage between 0 and 100),
  discount_amount      numeric(14,3) generated always as (round(quantity * unit_price * discount_percentage / 100, 3)) stored,
  tax_amount           numeric(14,3) generated always as
                       (round((quantity * unit_price * (1 - discount_percentage / 100)) * tax_rate_percentage / 100, 3)) stored,
  line_total           numeric(14,3) generated always as
                       (round(quantity * unit_price * (1 - discount_percentage / 100) * (1 + tax_rate_percentage / 100), 3)) stored,
  vehicle_id           uuid references public.vehicles(id),
  expense_category     text,
  gl_account_code      text,
  cost_centre          text,
  unique (invoice_id, line_no)
);

create table public.journal_entries (
  id             uuid primary key default gen_random_uuid(),
  legacy_id      text unique,
  company_id     uuid not null references public.companies(id),
  entry_number   text not null,
  date           date not null,
  reference      text,
  description    text not null,
  posted_by      uuid references public.profiles(id) default auth.uid(),
  status         text not null default 'Posted' check (status in ('Draft','Posted','Void')),
  source_module  text not null default 'Manual'
                 check (source_module in ('Maintenance','Invoice','Payment','Depreciation','Expense','Payroll','Manual')),
  source_id      uuid,
  attachment_path text,
  reverses_entry_id uuid references public.journal_entries(id),
  created_at     timestamptz not null default now(),
  unique (company_id, entry_number)
);

create table public.journal_lines (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.journal_entries(id) on delete cascade,
  company_id    uuid not null,
  account_code  text not null,
  debit         numeric(14,3) not null default 0 check (debit >= 0),
  credit        numeric(14,3) not null default 0 check (credit >= 0),
  description   text,
  vehicle_id    uuid references public.vehicles(id),
  cost_centre   text,
  foreign key (company_id, account_code) references public.accounts(company_id, code),
  check ((debit > 0) <> (credit > 0))         -- exactly one side per line
);

alter table public.invoices
  add constraint invoices_journal_fk foreign key (journal_entry_id) references public.journal_entries(id);

create table public.payments (
  id                    uuid primary key default gen_random_uuid(),
  legacy_id             text unique,
  company_id            uuid not null references public.companies(id),
  payment_number        text not null,
  invoice_id            uuid not null references public.invoices(id) on delete restrict,
  payment_date          date not null,
  amount                numeric(14,3) not null check (amount > 0),
  currency              text not null default 'OMR',
  payment_method        text not null,
  bank_account_id       uuid not null references public.bank_accounts(id),
  transaction_reference text,
  cheque_number         text,
  attachment_path       text,
  notes                 text,
  journal_entry_id      uuid references public.journal_entries(id),
  created_by            uuid references public.profiles(id) default auth.uid(),
  created_at            timestamptz not null default now(),
  unique (company_id, payment_number)
);

create table public.reconciliations (
  id                     uuid primary key default gen_random_uuid(),
  legacy_id              text unique,
  company_id             uuid not null references public.companies(id),
  reconciliation_number  text not null,
  invoice_id             uuid not null references public.invoices(id),
  matching_type          text not null check (matching_type in ('2-Way','3-Way')),
  purchase_order_number  text,
  purchase_order_amount  numeric(14,3) check (purchase_order_amount >= 0),
  work_order_id          uuid references public.work_orders(id),
  goods_received_amount  numeric(14,3) check (goods_received_amount >= 0),
  invoice_amount         numeric(14,3) not null,
  difference_amount      numeric(14,3) not null,
  variance_percentage    numeric(8,3) not null,
  status                 text not null check (status in ('Matched','Partially Matched','Mismatch','Pending Review','Reconciled')),
  discrepancy_reason     text,
  reconciled_by          uuid references public.profiles(id) default auth.uid(),
  reconciled_date        date,
  notes                  text,
  created_at             timestamptz not null default now(),
  unique (company_id, reconciliation_number),
  check (matching_type = '2-Way' or goods_received_amount is not null)
);

-- ---------------------------------------------------------------------
-- 8. Fixed assets & depreciation
-- ---------------------------------------------------------------------
create table public.fixed_assets (
  id                     uuid primary key default gen_random_uuid(),
  legacy_id              text unique,
  company_id             uuid not null references public.companies(id),
  asset_code             text not null,
  name                   text not null,
  category               text not null,
  serial_number          text,
  vehicle_id             uuid references public.vehicles(id),
  location text, department text,
  purchase_date          date not null,
  purchase_cost          numeric(14,3) not null check (purchase_cost >= 0),
  salvage_value          numeric(14,3) not null default 0 check (salvage_value >= 0),
  useful_life_years      numeric(5,2) not null check (useful_life_years > 0),
  annual_rate_percentage numeric(6,3) not null check (annual_rate_percentage >= 0),
  depreciation_method    text not null check (depreciation_method in ('Straight-Line','Reducing Balance','Double Declining')),
  accumulated_depreciation numeric(14,3) not null default 0 check (accumulated_depreciation >= 0),
  current_book_value     numeric(14,3) generated always as (purchase_cost - accumulated_depreciation) stored,
  current_market_value   numeric(14,3),
  gl_asset_account       text not null,
  gl_expense_account     text not null,
  gl_accum_dep_account   text not null,
  status                 text not null default 'Active' check (status in ('Active','Under Maintenance','Fully Depreciated','Disposed')),
  supplier_id            uuid references public.suppliers(id),
  notes text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (company_id, asset_code),
  check (salvage_value <= purchase_cost),
  check (accumulated_depreciation <= purchase_cost - salvage_value + 0.0005)   -- never below salvage
);

create table public.depreciation_runs (
  id                 uuid primary key default gen_random_uuid(),
  legacy_id          text unique,
  company_id         uuid not null references public.companies(id),
  batch_number       text not null,
  period             date not null,                    -- first day of the period
  period_label       text not null,
  run_date           date not null,
  total_assets       integer not null default 0,
  total_amount       numeric(14,3) not null default 0,
  currency           text not null default 'OMR',
  journal_entry_id   uuid references public.journal_entries(id),
  status             text not null default 'Posted' check (status in ('Draft','Posted','Reversed')),
  processed_by       uuid references public.profiles(id) default auth.uid(),
  notes              text,
  created_at         timestamptz not null default now(),
  unique (company_id, batch_number),
  unique (company_id, period)                         -- no double runs (audit fix, enforced in DB)
);

create table public.depreciation_run_items (
  run_id              uuid not null references public.depreciation_runs(id) on delete cascade,
  asset_id            uuid not null references public.fixed_assets(id) on delete restrict,
  previous_book_value numeric(14,3) not null,
  depreciation_amount numeric(14,3) not null check (depreciation_amount >= 0),
  new_book_value      numeric(14,3) not null,
  primary key (run_id, asset_id)
);

-- ---------------------------------------------------------------------
-- 9. HR & payroll
-- ---------------------------------------------------------------------
create table public.employees (
  id                     uuid primary key default gen_random_uuid(),
  legacy_id              text unique,
  company_id             uuid not null references public.companies(id),
  employee_code          text not null,
  name                   text not null,
  designation            text not null,
  department             text not null,
  email text, phone text,
  civil_id text, passport_number text, nationality text,     -- sensitive: restricted to payroll roles via RLS
  joining_date           date not null,
  status                 text not null default 'Active' check (status in ('Active','On Leave','Probation','Terminated')),
  avatar text,
  basic_salary           numeric(14,3) not null check (basic_salary >= 0),
  housing_allowance      numeric(14,3) not null default 0 check (housing_allowance >= 0),
  transport_allowance    numeric(14,3) not null default 0 check (transport_allowance >= 0),
  other_allowances       numeric(14,3) not null default 0 check (other_allowances >= 0),
  total_gross_salary     numeric(14,3) generated always as
                         (basic_salary + housing_allowance + transport_allowance + other_allowances) stored,
  bank_name text, bank_account_number text, iban text,
  payment_method         text not null default 'Bank Transfer' check (payment_method in ('Bank Transfer','Cash','Cheque')),
  social_security_number text,
  pasi_employee_pct      numeric(5,2) not null default 7 check (pasi_employee_pct between 0 and 100),
  pasi_employer_pct      numeric(5,2) not null default 11.5 check (pasi_employer_pct between 0 and 100),
  assigned_vehicle_id    uuid references public.vehicles(id) on delete set null,
  notes text,
  created_at             timestamptz not null default now(),
  unique (company_id, employee_code)
);

create table public.payroll_runs (
  id                 uuid primary key default gen_random_uuid(),
  legacy_id          text unique,
  company_id         uuid not null references public.companies(id),
  payroll_number     text not null,
  month              integer not null check (month between 1 and 12),
  year               integer not null check (year between 2000 and 2100),
  status             text not null default 'Draft' check (status in ('Draft','Under Review','Approved','Paid','Cancelled')),
  approved_by        uuid references public.profiles(id),
  approved_date      timestamptz,
  payment_date       date,
  bank_account_id    uuid references public.bank_accounts(id),
  journal_entry_id   uuid references public.journal_entries(id),
  notes              text,
  created_at         timestamptz not null default now(),
  unique (company_id, payroll_number),
  unique (company_id, year, month)                    -- one payroll per month (audit fix, enforced in DB)
);

create table public.payroll_items (
  id                     uuid primary key default gen_random_uuid(),
  run_id                 uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id            uuid not null references public.employees(id) on delete restrict,
  basic_salary           numeric(14,3) not null,
  housing_allowance      numeric(14,3) not null default 0,
  transport_allowance    numeric(14,3) not null default 0,
  other_allowances       numeric(14,3) not null default 0,
  overtime_amount        numeric(14,3) not null default 0 check (overtime_amount >= 0),
  bonus_amount           numeric(14,3) not null default 0 check (bonus_amount >= 0),
  gross_pay              numeric(14,3) generated always as
                         (basic_salary + housing_allowance + transport_allowance + other_allowances + overtime_amount + bonus_amount) stored,
  pasi_employee_deduction numeric(14,3) not null default 0 check (pasi_employee_deduction >= 0),
  unpaid_leave_deduction numeric(14,3) not null default 0 check (unpaid_leave_deduction >= 0),
  loan_advance_deduction numeric(14,3) not null default 0 check (loan_advance_deduction >= 0),
  other_deductions       numeric(14,3) not null default 0 check (other_deductions >= 0),
  total_deductions       numeric(14,3) generated always as
                         (pasi_employee_deduction + unpaid_leave_deduction + loan_advance_deduction + other_deductions) stored,
  net_pay                numeric(14,3) generated always as
                         (basic_salary + housing_allowance + transport_allowance + other_allowances + overtime_amount + bonus_amount
                          - pasi_employee_deduction - unpaid_leave_deduction - loan_advance_deduction - other_deductions) stored,
  status                 text not null default 'Pending' check (status in ('Pending','Processed','Paid')),
  unique (run_id, employee_id)
);

-- ---------------------------------------------------------------------
-- 10. Workflow, notifications, audit
-- ---------------------------------------------------------------------
create table public.approval_rules (
  id               uuid primary key default gen_random_uuid(),
  legacy_id        text unique,
  module           text not null check (module in ('maintenance','invoice','expense','disposal')),
  threshold_amount numeric(14,3) not null check (threshold_amount >= 0),
  currency         text not null default 'OMR',
  required_roles   public.user_role[] not null,
  description      text,
  active           boolean not null default true
);

create table public.approval_requests (
  id               uuid primary key default gen_random_uuid(),
  legacy_id        text unique,
  company_id       uuid not null references public.companies(id),
  reference_type   text not null check (reference_type in ('WorkOrder','Invoice','Expense')),
  reference_id     uuid not null,
  reference_number text not null,
  requested_by     uuid references public.profiles(id) default auth.uid(),
  requested_at     timestamptz not null default now(),
  amount           numeric(14,3) not null check (amount >= 0),
  currency         text not null default 'OMR',
  status           text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  current_level    integer not null default 1,
  total_levels     integer not null default 1 check (total_levels >= 1),
  required_roles   public.user_role[] not null default '{}',
  notes            text
);

create table public.approval_actions (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.approval_requests(id) on delete cascade,
  level        integer not null,
  approver_id  uuid not null references public.profiles(id),
  approver_role public.user_role not null,
  action       text not null check (action in ('Approved','Rejected')),
  comment      text not null check (length(trim(comment)) > 0),   -- required comment (audit fix)
  acted_at     timestamptz not null default now(),
  unique (request_id, level)
);

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  company_id    uuid not null references public.companies(id),
  user_id       uuid references public.profiles(id) on delete cascade,  -- null = everyone in the company
  type          text not null,
  title         text not null,
  message       text not null,
  severity      text not null check (severity in ('info','warning','critical','success')),
  link          text,
  vehicle_id    uuid references public.vehicles(id) on delete cascade,
  reference_id  uuid,
  created_at    timestamptz not null default now()
);

create table public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- Append-only; written by triggers, never by the client.
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  user_id      uuid default auth.uid(),
  user_role    public.user_role default public.app_role(),
  company_id   uuid,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  old_value    jsonb,
  new_value    jsonb
);

-- ---------------------------------------------------------------------
-- 11. Indexes for FK lookups and the common list filters
-- ---------------------------------------------------------------------
create index on public.vehicles (company_id, status);
create index on public.tyres (vehicle_id);
create index on public.tyre_events (vehicle_id, date desc);
create index on public.oil_changes (vehicle_id, date desc);
create index on public.work_orders (company_id, status);
create index on public.work_orders (vehicle_id);
create index on public.maintenance_records (vehicle_id, maintenance_date desc);
create index on public.maintenance_records (company_id, maintenance_date desc);
create index on public.accidents (vehicle_id);
create index on public.expenses (company_id, date desc);
create index on public.expenses (vehicle_id);
create index on public.documents (company_id, expiry_date);
create index on public.vehicle_timeline (vehicle_id, date desc);
create index on public.invoices (company_id, invoice_date desc);
create index on public.invoices (supplier_id);
create index on public.invoices (customer_id);
create index on public.invoices (company_id, due_date) where payment_status <> 'Paid';
create index on public.invoice_lines (invoice_id);
create index on public.payments (invoice_id);
create index on public.payments (bank_account_id);
create index on public.journal_entries (company_id, date);
create index on public.journal_lines (entry_id);
create index on public.journal_lines (company_id, account_code);
create index on public.payroll_items (employee_id);
create index on public.approval_requests (company_id, status);
create index on public.notifications (company_id, created_at desc);
create index on public.audit_logs (company_id, occurred_at desc);
create index on public.audit_logs (entity_type, entity_id);
